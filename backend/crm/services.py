"""
Service layer of the CRM domain.

Domain functions that receive `user` (the owner) and already-parsed data. They
are used by the MCP server (`crm_mcp`); the existing REST views stay unchanged.

Rules:
- Strict owner scoping: EVERY query filters by `owner=user` (or
  `person__owner=user`). A foreign id is treated as nonexistent.
- Validation reuses the DRF serializers (with a minimal "request" that only
  carries `user`), so the rules are the same as in REST.
- Arguments are data: they are never interpreted or executed.
- Write functions return `Outcome` (data + created/touched object)
  so the caller can record the action.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers as drf_serializers

from .models import (
    ContactInfo,
    ImportantDate,
    Interaction,
    Note,
    Organization,
    Person,
    PersonOrganization,
    Reminder,
    Tag,
)
from .serializers import (
    ContactInfoSerializer,
    ImportantDateSerializer,
    InteractionSerializer,
    NoteSerializer,
    OrganizationSerializer,
    PersonOrganizationSerializer,
    PersonSerializer,
    ReminderSerializer,
)

MAX_RESULTS = 50
MAX_TAGS_PER_CALL = 20
VALID_CREATED_VIA = {"ui", "mcp", "import"}


class ServiceError(Exception):
    """Domain error with a readable message (validation, not found, etc.)."""


@dataclass
class Outcome:
    """Result of a write: data for the client + affected object."""

    data: dict[str, Any]
    target_type: str = ""
    target_id: int | None = None
    created: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _ctx(user) -> dict:
    """Minimal context for the serializers (only `request.user`)."""
    return {"request": SimpleNamespace(user=user)}


def _validate(serializer: drf_serializers.Serializer) -> dict:
    if not serializer.is_valid():
        raise ServiceError(_flatten_errors(serializer.errors))
    return serializer.validated_data


def _flatten_errors(errors) -> str:
    parts: list[str] = []
    if isinstance(errors, dict):
        for key, value in errors.items():
            parts.append(f"{key}: {_flatten_errors(value)}")
    elif isinstance(errors, (list, tuple)):
        parts.extend(_flatten_errors(v) for v in errors)
    else:
        parts.append(str(errors))
    return "; ".join(parts)


def _check_via(created_via: str) -> str:
    if created_via not in VALID_CREATED_VIA:
        raise ServiceError("created_via invalido.")
    return created_via


def user_tz():
    """The user's time zone. User has no such field: uses settings.TIME_ZONE."""
    from zoneinfo import ZoneInfo

    return ZoneInfo(settings.TIME_ZONE)


def parse_when(value: str | datetime | date | None, *, field_name: str = "fecha") -> datetime:
    """
    Parses an ISO 8601 date/time. No zone -> the user's zone. Date only
    -> 09:00 in the user's zone.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ServiceError(f"{field_name} es obligatoria.")
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = datetime.combine(value, time(9, 0))
    else:
        text = str(value).strip()
        dt = None
        try:
            dt = parse_datetime(text)
        except ValueError:
            dt = None
        if dt is None:
            try:
                d = parse_date(text)
            except ValueError:
                d = None
            if d is None:
                raise ServiceError(
                    f"{field_name} invalida: usa formato ISO 8601 (2026-11-05T15:30 o 2026-11-05)."
                )
            dt = datetime.combine(d, time(9, 0))
    if timezone.is_naive(dt):
        dt = dt.replace(tzinfo=user_tz())
    return dt


def _get_person(user, person_id: int) -> Person:
    try:
        return Person.objects.get(pk=int(person_id), owner=user)
    except (Person.DoesNotExist, TypeError, ValueError):
        raise ServiceError(f"No existe la persona {person_id}.")


def _get_reminder(user, reminder_id: int) -> Reminder:
    try:
        return Reminder.objects.get(pk=int(reminder_id), owner=user)
    except (Reminder.DoesNotExist, TypeError, ValueError):
        raise ServiceError(f"No existe el recordatorio {reminder_id}.")


def _get_organization(user, organization_id: int) -> Organization:
    try:
        return Organization.objects.get(pk=int(organization_id), owner=user)
    except (Organization.DoesNotExist, TypeError, ValueError):
        raise ServiceError(f"No existe la institucion {organization_id}.")


def _limit(value: int | None, default: int = 25) -> int:
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        n = default
    return max(1, min(n, MAX_RESULTS))


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def resolve_tags(user, names: list[str] | None) -> list[Tag]:
    """Look up the owner's tags by name (case-insensitive); create the missing ones."""
    result: list[Tag] = []
    seen: set[str] = set()
    for raw in (names or [])[:MAX_TAGS_PER_CALL]:
        name = str(raw).strip()
        if not name:
            continue
        if len(name) > 50:
            raise ServiceError("Un nombre de tag no puede superar 50 caracteres.")
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        tag = Tag.objects.filter(owner=user, name__iexact=name).first()
        if tag is None:
            tag = Tag.objects.create(owner=user, name=name)
        result.append(tag)
    return result


# ---------------------------------------------------------------------------
# Representations (no encrypted fields except get_person by id)
# ---------------------------------------------------------------------------


def person_summary(p: Person) -> dict:
    return {
        "id": p.pk,
        "display_name": p.display_name,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "nick_name": p.nick_name,
        "company": p.company,
        "role": p.role,
        "favorite": p.favorite,
        "cadence_status": p.cadence_status,
        "last_contacted_at": _iso(p.last_contacted_at),
        "tags": [t.name for t in p.tags.all()],
    }


def organization_summary(o: Organization) -> dict:
    return {
        "id": o.pk,
        "name": o.name,
        "kind": o.kind,
        "city": o.city,
        "country": o.country,
    }


def reminder_data(r: Reminder) -> dict:
    return {
        "id": r.pk,
        "title": r.title,
        "remind_at": _iso(r.remind_at),
        "kind": r.kind,
        "status": r.status,
        "completed": r.completed,
        "location": r.location,
        "recur": r.recur,
        "lead_minutes": r.lead_minutes,
        "person_id": r.person_id,
        "participant_ids": [p.pk for p in r.participants.all()],
    }


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def search_persons(
    user, query: str = "", tag: str | None = None,
    favorite: bool | None = None, limit: int | None = None,
) -> dict:
    qs = Person.objects.filter(owner=user).prefetch_related("tags")
    query = (query or "").strip()
    if query:
        from django.db.models import Q

        qs = qs.filter(
            Q(first_name__icontains=query) | Q(last_name__icontains=query)
            | Q(nick_name__icontains=query) | Q(company__icontains=query)
        )
    if tag:
        qs = qs.filter(tags__owner=user, tags__name__iexact=str(tag).strip())
    if favorite is not None:
        qs = qs.filter(favorite=bool(favorite))
    qs = qs.distinct().order_by("first_name", "last_name")[: _limit(limit)]
    return {"persons": [person_summary(p) for p in qs]}


def get_person(user, person_id: int) -> dict:
    p = _get_person(user, person_id)
    data = person_summary(p)
    data["how_we_met"] = p.how_we_met_enc
    data["cadence_days"] = p.cadence_days
    data["contacts"] = [
        {"id": c.pk, "type": c.type, "value": c.value, "label": c.label}
        for c in p.contacts_info.all()
    ]
    data["important_dates"] = [
        {
            "id": d.pk, "kind": d.kind, "title": d.title, "date": d.date.isoformat(),
            "birth_year": d.birth_year, "recurrence": d.recurrence,
            "days_until_next": d.days_until_next(),
        }
        for d in p.important_dates.all()
    ]
    data["recent_interactions"] = [
        {
            "id": i.pk, "kind": i.kind, "occurred_at": _iso(i.occurred_at),
            "channel": i.channel, "body": i.body_enc[:500],
            "counts_as_contact": i.counts_as_contact,
        }
        for i in p.interactions.order_by("-occurred_at")[:5]
    ]
    data["notes"] = [
        {"id": n.pk, "category": n.category, "body": n.body_enc[:1000],
         "created_at": _iso(n.created_at)}
        for n in p.notes.order_by("-created_at")[:10]
    ]
    data["organizations"] = [
        {
            "membership_id": m.pk, "organization_id": m.organization_id,
            "name": m.organization.name, "role": m.role, "is_current": m.is_current,
        }
        for m in p.memberships.select_related("organization")
    ]
    data["upcoming_reminders"] = [
        reminder_data(r)
        for r in Reminder.objects.filter(owner=user, person=p, completed=False)
        .order_by("remind_at")[:5]
    ]
    return data


def list_tags(user) -> dict:
    return {"tags": [{"id": t.pk, "name": t.name, "color": t.color}
                     for t in Tag.objects.filter(owner=user)]}


def list_upcoming(user, days: int = 30) -> dict:
    try:
        days = max(1, min(int(days), 365))
    except (TypeError, ValueError):
        days = 30
    now = timezone.now()
    until = now + timedelta(days=days)

    dates = []
    qs = ImportantDate.objects.filter(person__owner=user).select_related("person")
    for d in qs:
        nxt = d.days_until_next()
        if nxt is not None and 0 <= nxt <= days:
            dates.append({
                "id": d.pk, "person_id": d.person_id, "person": d.person.display_name,
                "kind": d.kind, "title": d.title, "date": d.date.isoformat(),
                "days_until": nxt,
            })
    dates.sort(key=lambda x: x["days_until"])

    upcoming = (
        Reminder.objects.filter(
            owner=user, completed=False, remind_at__gte=now, remind_at__lte=until,
        )
        .select_related("person").prefetch_related("participants")
        .order_by("remind_at")[: MAX_RESULTS * 2]
    )
    reminders, meetings = [], []
    for r in upcoming:
        item = reminder_data(r)
        item["person"] = r.person.display_name if r.person_id else None
        (meetings if r.kind == "meeting" else reminders).append(item)
    return {"days": days, "dates": dates, "reminders": reminders, "meetings": meetings}


def list_overdue_contacts(user, limit: int | None = None) -> dict:
    persons = Person.objects.filter(owner=user, cadence_days__isnull=False).prefetch_related("tags")
    overdue = [p for p in persons if p.cadence_status == "overdue"]
    overdue.sort(key=lambda p: p.last_contacted_at or timezone.now())
    overdue = overdue[: _limit(limit)]
    items = []
    for p in overdue:
        row = person_summary(p)
        row["cadence_days"] = p.cadence_days
        row["days_overdue"] = (
            (timezone.now() - (p.last_contacted_at + timedelta(days=p.cadence_days))).days
            if p.last_contacted_at else None
        )
        items.append(row)
    return {"persons": items}


def search_organizations(user, query: str = "", kind: str | None = None,
                         limit: int | None = None) -> dict:
    from django.db.models import Q

    qs = Organization.objects.filter(owner=user)
    query = (query or "").strip()
    if query:
        qs = qs.filter(Q(name__icontains=query) | Q(city__icontains=query))
    if kind:
        qs = qs.filter(kind=kind)
    return {"organizations": [organization_summary(o) for o in qs[: _limit(limit)]]}


# ---------------------------------------------------------------------------
# Writing: persons
# ---------------------------------------------------------------------------


def find_duplicate_persons(user, first_name: str, last_name: str = "") -> list[Person]:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    if not first:
        return []
    qs = Person.objects.filter(owner=user, first_name__iexact=first)
    if last:
        qs = qs.filter(last_name__iexact=last)
    return list(qs[:10])


def create_person(
    user, *, first_name: str, last_name: str = "", nick_name: str = "",
    company: str = "", role: str = "", how_we_met: str = "",
    tags: list[str] | None = None, force: bool = False, created_via: str = "ui",
) -> Outcome:
    _check_via(created_via)
    first_name = (first_name or "").strip()
    if not first_name:
        raise ServiceError("first_name es obligatorio.")
    if not force:
        dups = find_duplicate_persons(user, first_name, last_name)
        if dups:
            return Outcome(data={
                "status": "duplicates",
                "message": (
                    "Ya existen personas con ese nombre. Si es otra persona, "
                    "repite la llamada con force=true; si es la misma, usa su id."
                ),
                "candidates": [person_summary(p) for p in dups],
            })
    payload = {
        "first_name": first_name, "last_name": (last_name or "").strip(),
        "nick_name": nick_name or "", "company": company or "", "role": role or "",
        "how_we_met": how_we_met or "",
    }
    with transaction.atomic():
        ser = PersonSerializer(data=payload, context=_ctx(user))
        _validate(ser)
        # PersonSerializer.create() sets owner from the context.
        person = ser.save(created_via=created_via)
        tag_objs = resolve_tags(user, tags)
        if tag_objs:
            person.tags.add(*tag_objs)
    return Outcome(
        data={"status": "created", "person": person_summary(person)},
        target_type="person", target_id=person.pk, created=True,
    )


_UPDATABLE_PERSON_FIELDS = (
    "first_name", "last_name", "nick_name", "company", "role",
    "how_we_met", "favorite", "cadence_days",
)


def update_person(user, person_id: int, **fields) -> Outcome:
    person = _get_person(user, person_id)
    payload = {k: v for k, v in fields.items() if k in _UPDATABLE_PERSON_FIELDS and v is not None}
    if not payload:
        raise ServiceError("No hay campos para actualizar.")
    ser = PersonSerializer(person, data=payload, partial=True, context=_ctx(user))
    _validate(ser)
    person = ser.save()
    return Outcome(
        data={"status": "updated", "person": person_summary(person)},
        target_type="person", target_id=person.pk,
    )


def add_contact_info(user, person_id: int, type: str, value: str, label: str = "",
                     created_via: str = "ui") -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    ser = ContactInfoSerializer(data={"type": type, "value": value, "label": label or ""})
    _validate(ser)
    obj = ser.save(person=person, created_via=created_via)
    return Outcome(
        data={"status": "created", "contact": {
            "id": obj.pk, "person_id": person.pk, "type": obj.type,
            "value": obj.value, "label": obj.label,
        }},
        target_type="contact_info", target_id=obj.pk, created=True,
    )


def add_birthday(user, person_id: int, month: int, day: int, year: int | None = None,
                 created_via: str = "ui") -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    try:
        month, day = int(month), int(day)
        if year is not None:
            year = int(year)
            if not (1900 <= year <= date.today().year):
                raise ServiceError("year fuera de rango.")
        # 2000 is a leap year: without a year, Feb 29 is accepted (it falls on Feb 28 in non-leap years).
        base = date(year or 2000, month, day)
    except ServiceError:
        raise
    except (TypeError, ValueError):
        raise ServiceError("month/day/year no forman una fecha valida.")
    if person.important_dates.filter(kind="birthday").exists():
        raise ServiceError("La persona ya tiene un cumpleanos registrado.")
    ser = ImportantDateSerializer(data={
        "kind": "birthday", "title": "Cumpleaños", "icon": "cake",
        "date": base.isoformat(), "birth_year": year, "recurrence": "yearly",
    })
    _validate(ser)
    obj = ser.save(person=person, created_via=created_via)
    return Outcome(
        data={"status": "created", "important_date": _important_date_data(obj)},
        target_type="important_date", target_id=obj.pk, created=True,
    )


def _important_date_data(d: ImportantDate) -> dict:
    return {
        "id": d.pk, "person_id": d.person_id, "kind": d.kind, "title": d.title,
        "date": d.date.isoformat(), "birth_year": d.birth_year, "recurrence": d.recurrence,
    }


def add_important_date(user, person_id: int, title: str, date_value: str,
                       recurrence: str = "yearly", created_via: str = "ui") -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    try:
        d = parse_date(str(date_value).strip())
    except ValueError:
        d = None
    if d is None:
        raise ServiceError("date invalida: usa formato YYYY-MM-DD.")
    ser = ImportantDateSerializer(data={
        "kind": "custom", "title": title, "date": d.isoformat(), "recurrence": recurrence,
    })
    _validate(ser)
    obj = ser.save(person=person, created_via=created_via)
    return Outcome(
        data={"status": "created", "important_date": _important_date_data(obj)},
        target_type="important_date", target_id=obj.pk, created=True,
    )


def add_note(user, person_id: int, body: str, category: str = "general",
             created_via: str = "ui") -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    ser = NoteSerializer(data={"body": body, "category": category})
    _validate(ser)
    obj = ser.save(person=person, created_via=created_via)
    return Outcome(
        data={"status": "created", "note": {
            "id": obj.pk, "person_id": person.pk, "category": obj.category,
        }},
        target_type="note", target_id=obj.pk, created=True,
    )


def log_interaction(user, person_id: int, kind: str, occurred_at: str | None = None,
                    body: str = "", counts_as_contact: bool = False, channel: str = "",
                    created_via: str = "ui") -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    when = parse_when(occurred_at, field_name="occurred_at") if occurred_at else timezone.now()
    ser = InteractionSerializer(data={
        "kind": kind, "occurred_at": when.isoformat(), "channel": channel or "",
        "body": body or "", "counts_as_contact": bool(counts_as_contact),
    })
    _validate(ser)
    obj = ser.save(person=person, created_via=created_via)
    return Outcome(
        data={"status": "created", "interaction": {
            "id": obj.pk, "person_id": person.pk, "kind": obj.kind,
            "occurred_at": _iso(obj.occurred_at),
            "counts_as_contact": obj.counts_as_contact,
        }},
        target_type="interaction", target_id=obj.pk, created=True,
    )


def tag_person(user, person_id: int, tag_names: list[str], created_via: str = "ui") -> Outcome:
    person = _get_person(user, person_id)
    tags = resolve_tags(user, tag_names)
    if not tags:
        raise ServiceError("tag_names esta vacio.")
    person.tags.add(*tags)
    return Outcome(
        data={"status": "tagged", "person_id": person.pk,
              "tags": [t.name for t in person.tags.all()]},
        target_type="person", target_id=person.pk,
    )


# ---------------------------------------------------------------------------
# Writing: reminders and meetings
# ---------------------------------------------------------------------------


def _owned_people(user, ids: list[int] | None) -> list[Person]:
    people: list[Person] = []
    seen: set[int] = set()
    for pid in ids or []:
        p = _get_person(user, pid)
        if p.pk not in seen:
            seen.add(p.pk)
            people.append(p)
    return people


def create_reminder(
    user, *, title: str, remind_at: str, person_id: int | None = None,
    recur: str = "none", lead_minutes: int = 0, message: str = "",
    kind: str = "task", location: str = "", participant_ids: list[int] | None = None,
    created_via: str = "ui",
) -> Outcome:
    _check_via(created_via)
    when = parse_when(remind_at, field_name="remind_at")
    person = _get_person(user, person_id) if person_id is not None else None
    participants = _owned_people(user, participant_ids)
    ser = ReminderSerializer(data={
        "title": title, "remind_at": when.isoformat(), "recur": recur,
        "lead_minutes": lead_minutes or 0, "message": message or "", "kind": kind,
        "location": location or "",
    }, context=_ctx(user))
    _validate(ser)
    with transaction.atomic():
        reminder = ser.save(owner=user, person=person, created_via=created_via)
        if participants:
            reminder.participants.set(participants)
    return Outcome(
        data={"status": "created", "reminder": reminder_data(reminder)},
        target_type="reminder", target_id=reminder.pk, created=True,
    )


def schedule_meeting(
    user, *, title: str, starts_at: str, person_ids: list[int] | None = None,
    ends_at: str | None = None, location: str = "", remind_before_minutes: int = 0,
    created_via: str = "ui",
) -> Outcome:
    """Meeting: Reminder kind=meeting; person = first participant, the rest in participants."""
    people = _owned_people(user, person_ids)
    start = parse_when(starts_at, field_name="starts_at")
    message = ""
    if ends_at:
        end = parse_when(ends_at, field_name="ends_at")
        if end <= start:
            raise ServiceError("ends_at debe ser posterior a starts_at.")
        message = f"Termina: {end.astimezone(user_tz()).strftime('%Y-%m-%d %H:%M')}"
    return create_reminder(
        user, title=title, remind_at=start.isoformat(),
        person_id=people[0].pk if people else None,
        participant_ids=[p.pk for p in people[1:]],
        lead_minutes=remind_before_minutes or 0, message=message, kind="meeting",
        location=location, created_via=created_via,
    )


def complete_reminder(user, reminder_id: int) -> Outcome:
    reminder = _get_reminder(user, reminder_id)
    if reminder.completed:
        raise ServiceError("El recordatorio ya estaba completado.")
    reminder.completed = True
    reminder.save()
    return Outcome(
        data={"status": "completed", "reminder": reminder_data(reminder)},
        target_type="reminder", target_id=reminder.pk,
    )


def move_reminder(user, reminder_id: int, status: str) -> Outcome:
    if status not in dict(Reminder.STATUS_CHOICES):
        raise ServiceError("status debe ser todo, in_progress o done.")
    reminder = _get_reminder(user, reminder_id)
    reminder.status = status
    reminder.save()
    return Outcome(
        data={"status": "moved", "reminder": reminder_data(reminder)},
        target_type="reminder", target_id=reminder.pk,
    )


# ---------------------------------------------------------------------------
# Writing: institutions
# ---------------------------------------------------------------------------


def create_organization(
    user, *, name: str, kind: str = "other", address: str = "", city: str = "",
    country: str = "", phone: str = "", email: str = "", website: str = "",
    notes: str = "", created_via: str = "ui",
) -> Outcome:
    _check_via(created_via)
    name = (name or "").strip()
    existing = Organization.objects.filter(owner=user, name__iexact=name).first() if name else None
    if existing:
        return Outcome(data={
            "status": "exists",
            "message": "Ya existe una institucion con ese nombre; usa su id.",
            "organization": organization_summary(existing),
        })
    ser = OrganizationSerializer(data={
        "name": name, "kind": kind, "address": address, "city": city, "country": country,
        "phone": phone, "email": email, "website": website, "notes": notes,
    }, context=_ctx(user))
    _validate(ser)
    org = ser.save(created_via=created_via)
    return Outcome(
        data={"status": "created", "organization": organization_summary(org)},
        target_type="organization", target_id=org.pk, created=True,
    )


def add_person_to_organization(
    user, person_id: int, organization_id: int, role: str = "", is_current: bool = True,
    start_year: int | None = None, end_year: int | None = None, created_via: str = "ui",
) -> Outcome:
    _check_via(created_via)
    person = _get_person(user, person_id)
    org = _get_organization(user, organization_id)
    ctx = {**_ctx(user), "organization": org}
    ser = PersonOrganizationSerializer(data={
        "person_id": person.pk, "role": role or "", "is_current": bool(is_current),
        "start_year": start_year, "end_year": end_year,
    }, context=ctx)
    _validate(ser)
    m = ser.save(organization=org, created_via=created_via)
    return Outcome(
        data={"status": "created", "membership": {
            "membership_id": m.pk, "person_id": person.pk, "organization_id": org.pk,
            "role": m.role, "is_current": m.is_current,
        }},
        target_type="membership", target_id=m.pk, created=True,
    )


# ---------------------------------------------------------------------------
# Undo creations (used by /api/mcp/actions/{id}/undo/)
# ---------------------------------------------------------------------------

# target_type -> model. Only objects created by a creation action.
UNDO_MODELS: dict[str, type] = {
    "person": Person,
    "contact_info": ContactInfo,
    "important_date": ImportantDate,
    "note": Note,
    "interaction": Interaction,
    "reminder": Reminder,
    "organization": Organization,
    "membership": PersonOrganization,
}


def _owner_of(obj) -> Any:
    if hasattr(obj, "owner_id"):
        return obj.owner_id
    if hasattr(obj, "person_id"):
        return obj.person.owner_id
    if hasattr(obj, "organization_id"):
        return obj.organization.owner_id
    return None


def undo_creation(user, target_type: str, target_id: int) -> str:
    """
    Deletes the object created by MCP. Rules: allowed model, exists, belongs to
    the owner, has created_via="mcp" and (person/institution) has no data
    loaded from the UI. Returns a message; raises ServiceError if not applicable.
    """
    model = UNDO_MODELS.get(target_type)
    if model is None or target_id is None:
        raise ServiceError("Esta accion no se puede deshacer.")
    try:
        obj = model.objects.get(pk=target_id)
    except model.DoesNotExist:
        raise ServiceError("El objeto ya no existe.")
    if _owner_of(obj) != user.pk:
        # Do not reveal the existence of foreign objects.
        raise ServiceError("El objeto ya no existe.")
    if getattr(obj, "created_via", None) != "mcp":
        raise ServiceError("El objeto no fue creado por un agente; no se borra.")

    if isinstance(obj, Person):
        extra = (
            obj.notes.exclude(created_via="mcp").exists()
            or obj.interactions.exclude(created_via="mcp").exists()
            or obj.important_dates.exclude(created_via="mcp").exists()
            or obj.contacts_info.exclude(created_via="mcp").exists()
            or obj.reminders.exclude(created_via="mcp").exists()
            or obj.memberships.exclude(created_via="mcp").exists()
        )
        if extra or _has_attachments(obj):
            raise ServiceError(
                "La persona tiene datos agregados desde la interfaz; no se borra automaticamente."
            )
    if isinstance(obj, Organization):
        if obj.memberships.exclude(created_via="mcp").exists() or _has_attachments(obj):
            raise ServiceError(
                "La institucion tiene datos agregados desde la interfaz; no se borra automaticamente."
            )
    with transaction.atomic():
        label = str(obj)
        obj.delete()
    return f"Deshecho: {label}"


def _has_attachments(obj) -> bool:
    from django.contrib.contenttypes.models import ContentType

    from crm_attachment.models import Attachment

    ct = ContentType.objects.get_for_model(type(obj))
    return Attachment.objects.filter(subject_type=ct, subject_id=obj.pk).exists()
