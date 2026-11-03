"""
API ViewSets for the CRM v1 domain.

All owner-scoped. Nested entities (ContactInfo, ImportantDate,
Interaction, Note) hang off Person via the URL.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import timedelta

from django.db.models import Count, DateTimeField, ExpressionWrapper, F, Prefetch, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from crm_backend.images import crop_from_data, process_upload

from . import importexport
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
    TagSerializer,
)


def _id_query_param(request, name: str):
    """Optional integer query param: None if absent; 400 if not numeric."""
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({name: "Debe ser un número entero."})


def _memberships_prefetch() -> Prefetch:
    """Prefetch memberships with their institution for PersonSerializer.organizations."""
    return Prefetch(
        "memberships",
        queryset=PersonOrganization.objects.select_related("organization"),
    )


def _bool_param(value, default: bool = False) -> bool:
    """Query/form boolean: 1/true/on/yes (case-insensitive)."""
    if value in (None, ""):
        return default
    return str(value).strip().lower() in ("1", "true", "on", "yes")


class _IgnoreFormatNegotiation(DefaultContentNegotiation):
    """DRF uses `?format=` to pick the renderer; here `format=vcf|google_csv` is our own parameter."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def _download_slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "contact"


# Person photo: size limit of the original file uploaded by the client.
PERSON_PHOTO_MAX_BYTES = 5 * 1024 * 1024


def _delete_attachment(attachment) -> None:
    """Delete the encrypted file and the row of an Attachment."""
    if attachment.file:
        try:
            attachment.file.delete(save=False)
        except Exception:
            pass
    attachment.delete()


class IsOwner(permissions.BasePermission):
    """The object (or its parent `person` or `reminder`) must belong to the user."""

    def has_object_permission(self, request, view, obj):
        # Personas / Reminders / Tags
        if hasattr(obj, "owner"):
            return obj.owner == request.user
        # Note / Interaction / ContactInfo / ImportantDate -> hang off Person
        person = getattr(obj, "person", None)
        if person is not None:
            return person.owner == request.user
        return False


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Tag.objects.filter(owner=self.request.user).annotate(
            person_count=Count("persons", filter=Q(persons__owner=self.request.user), distinct=True),
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        qs = (
            Person.objects.filter(owner=self.request.user)
            .select_related("owner")
            .prefetch_related("tags", "contacts_info", _memberships_prefetch())
            .annotate(
                _notes_count=Count("notes", distinct=True),
                _interactions_count=Count("interactions", distinct=True),
            )
        )
        # Query param filters
        params = self.request.query_params
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(nick_name__icontains=search)
            )
        tag = _id_query_param(self.request, "tag")
        if tag is not None:
            qs = qs.filter(tags__id=tag)
        cadence = params.get("cadence_status")
        if cadence:
            # Computed in code; filter manually.
            ids = [p.pk for p in qs if p.cadence_status == cadence]
            qs = qs.filter(pk__in=ids)
        # Favorites (true/false). The client sends ?favorite=true to list only
        # favorites, ?favorite=false to exclude them. Default: both.
        favorite = params.get("favorite")
        if favorite in ("true", "1"):
            qs = qs.filter(favorite=True)
        elif favorite in ("false", "0"):
            qs = qs.filter(favorite=False)
        # Ordering (?ordering=-created_at | name | last_contacted). Default: name asc.
        ordering = params.get("ordering", "name")
        if ordering == "-created_at":
            qs = qs.order_by("-created_at")
        elif ordering == "last_contacted":
            qs = qs.order_by("last_contacted_at")
        return qs

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("No puedes borrar personas de otro usuario.")
        instance.delete()

    # ----- Import / export (spec v6 K) -----------------------------------

    def _parse_import_file(self, request) -> importexport.ParsedFile:
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Selecciona un archivo .vcf o .csv."})
        if upload.size > importexport.MAX_IMPORT_BYTES:
            raise ValidationError({"file": (
                f"El archivo excede el límite de {importexport.MAX_IMPORT_BYTES // (1024 * 1024)} MB."
            )})
        try:
            return importexport.parse_upload(upload.read(), upload.name or "")
        except importexport.ImportFileError as exc:
            raise ValidationError({"file": str(exc)})

    @action(
        detail=False, methods=["post"], url_path="import/preview",
        parser_classes=[MultiPartParser],
    )
    def import_preview(self, request):
        """Preview of a .vcf / Google CSV. Writes nothing."""
        parsed = self._parse_import_file(request)
        return Response(importexport.preview(request.user, parsed))

    @action(
        detail=False, methods=["post"], url_path="import",
        parser_classes=[MultiPartParser],
    )
    def import_contacts(self, request):
        """Import contacts: `duplicates` skip|merge|create, optional `tag`, `import_labels`."""
        duplicates = (request.data.get("duplicates") or "skip").strip().lower()
        if duplicates not in importexport.DUPLICATE_MODES:
            raise ValidationError({"duplicates": "Opción de duplicados no válida."})
        tag_name = (request.data.get("tag") or "").strip()
        if len(tag_name) > 50:
            raise ValidationError({"tag": "Máximo 50 caracteres."})
        parsed = self._parse_import_file(request)
        try:
            result = importexport.run_import(
                request.user, parsed, duplicates=duplicates, tag_name=tag_name,
                import_labels=_bool_param(request.data.get("import_labels")),
            )
        except importexport.ImportFileError as exc:
            raise ValidationError({"file": str(exc)})
        return Response(result)

    @staticmethod
    def _export_response(content: str, fmt: str, filename: str) -> HttpResponse:
        mime = "text/vcard" if fmt == "vcf" else "text/csv"
        response = HttpResponse(content, content_type=f"{mime}; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Cache-Control"] = "no-store"
        return response

    @action(
        detail=False, methods=["get"], url_path="export",
        content_negotiation_class=_IgnoreFormatNegotiation,
    )
    def export(self, request):
        """Download: `?format=vcf|google_csv&tag=<id>&include_notes=0|1`."""
        fmt = request.query_params.get("format", "vcf")
        if fmt not in ("vcf", "google_csv"):
            raise ValidationError({"format": "Formato no válido. Usa vcf o google_csv."})
        include_notes = _bool_param(request.query_params.get("include_notes"))
        persons = Person.objects.filter(owner=request.user)
        tag_id = _id_query_param(request, "tag")
        if tag_id is not None:
            if not Tag.objects.filter(pk=tag_id, owner=request.user).exists():
                raise ValidationError({"tag": "La etiqueta no existe."})
            persons = persons.filter(tags__id=tag_id)
        persons = persons.prefetch_related(
            "tags", "contacts_info", "important_dates",
            *(["notes"] if include_notes else []),
        ).order_by("first_name", "last_name", "pk")
        today = timezone.localdate().isoformat()
        if fmt == "vcf":
            content = importexport.export_vcards(persons, include_notes)
            name = f"simple-crm-contacts-{today}.vcf"
        else:
            content = importexport.export_google_csv(persons, include_notes)
            name = f"simple-crm-contacts-{today}.csv"
        return self._export_response(content, fmt, name)

    @action(detail=True, methods=["get"], url_path="vcard")
    def vcard(self, request, pk=None):
        """A single person as vCard 3.0."""
        person = self.get_object()
        include_notes = _bool_param(request.query_params.get("include_notes"))
        person = Person.objects.prefetch_related(
            "tags", "contacts_info", "important_dates", "notes",
        ).get(pk=person.pk, owner=request.user)
        content = importexport.export_vcards([person], include_notes)
        return self._export_response(content, "vcf", f"{_download_slug(person.display_name)}.vcf")

    @action(detail=True, methods=["post"], url_path="toggle-favorite")
    def toggle_favorite(self, request, pk=None):
        """
        Optional body: {"favorite": true|false}. If not sent, toggles the
        current state. Returns {id, favorite} (the new state).
        """
        person = self.get_object()
        if "favorite" in request.data:
            new_state = bool(request.data["favorite"])
        else:
            new_state = not person.favorite
        person.favorite = new_state
        person.save(update_fields=["favorite", "updated_at"])
        return Response({"id": person.pk, "favorite": person.favorite})

    @action(
        detail=True, methods=["post", "delete"], url_path="profile_photo",
        parser_classes=[MultiPartParser, FormParser],
    )
    def profile_photo(self, request, pk=None):
        """
        POST multipart: `file` + optional `crop_x/crop_y/crop_w/crop_h` (pixels of the
        original image). Saves the processed photo as an encrypted Attachment of the person
        and returns the person. DELETE removes the photo (deletes the Attachment).
        """
        from django.contrib.contenttypes.models import ContentType

        from crm_attachment.models import Attachment

        person = self.get_object()
        old_photo = person.profile_photo

        if request.method == "DELETE":
            if old_photo is not None:
                _delete_attachment(old_photo)
            return Response(status=status.HTTP_204_NO_CONTENT)

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Selecciona una imagen."})
        try:
            processed = process_upload(
                upload, crop_from_data(request.data), max_bytes=PERSON_PHOTO_MAX_BYTES,
            )
        except ValidationError as exc:
            raise ValidationError({"file": exc.detail})

        attachment = Attachment(
            owner=request.user,
            title="profile_photo",
            original_filename=processed.name,
            mime_type=processed.content_type,
            size_bytes=processed.size,
            subject_type=ContentType.objects.get_for_model(Person),
            subject_id=person.pk,
        )
        attachment.file.save(processed.name, processed, save=False)
        attachment.save()

        person.profile_photo = attachment
        person.save(update_fields=["profile_photo", "updated_at"])
        if old_photo is not None:
            _delete_attachment(old_photo)

        fresh = self.get_queryset().get(pk=person.pk)
        return Response(
            self.get_serializer(fresh).data, status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-contacted")
    def mark_contacted(self, request, pk=None):
        """
        Body: { "occurred_at": "2026-09-24T15:00:00Z" } (optional, default now)
        Creates an Interaction(kind=call, counts_as_contact=True) and updates
        last_contacted_at (via signal).
        """
        person = self.get_object()
        data = request.data
        if not isinstance(data, dict):
            raise ValidationError({"detail": "El cuerpo debe ser un objeto."})
        body = data.get("body", "")
        if not isinstance(body, str):
            raise ValidationError({"body": "Debe ser texto."})
        serializer = InteractionSerializer(data={
            "kind": data.get("kind") or "call",
            "occurred_at": data.get("occurred_at") or timezone.now().isoformat(),
            "channel": data.get("channel", ""),
            "body": body,
            "counts_as_contact": True,
        })
        serializer.is_valid(raise_exception=True)
        interaction = serializer.save(person=person)
        return Response(
            InteractionSerializer(interaction).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        """Latest interaction, pending reminders, upcoming important dates."""
        person = self.get_object()
        last_interaction = (
            person.interactions.order_by("-occurred_at").first()
        )
        upcoming_reminders = (
            person.reminders.filter(completed=False, remind_at__gte=timezone.now())
            .order_by("remind_at")[:5]
        )
        upcoming_dates = [
            d for d in person.important_dates.all()
            if d.days_until_next() is not None and d.days_until_next() <= 60
        ]
        upcoming_dates.sort(key=lambda d: d.days_until_next() or 0)

        return Response({
            "last_interaction": InteractionSerializer(last_interaction).data if last_interaction else None,
            "upcoming_reminders": ReminderSerializer(upcoming_reminders, many=True).data,
            "upcoming_important_dates": ImportantDateSerializer(upcoming_dates, many=True).data,
        })


# ---------------------------------------------------------------------------
# Nested ViewSets - hang off Person via lookup_field.
# ---------------------------------------------------------------------------


class _PersonScopedViewSet(viewsets.ModelViewSet):
    """Base for viewsets that hang off Person (ContactInfo, Interaction, Note, ImportantDate)."""
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def _get_person(self) -> Person:
        person_id = self.kwargs.get("person_pk") or self.kwargs.get("person_id")
        if not person_id:
            raise PermissionDenied("Falta person_id en URL.")
        person = get_object_or_404(Person, pk=person_id, owner=self.request.user)
        return person

    def get_queryset(self):
        person = self._get_person()
        return self.model.objects.filter(person=person)

    def perform_create(self, serializer):
        person = self._get_person()
        serializer.save(person=person)

    def perform_destroy(self, instance):
        # For entities that hang off person, the ownership check in
        # IsOwner.has_object_permission() already validates that
        # instance.person.owner is the request.user.
        instance.delete()


class ContactInfoViewSet(_PersonScopedViewSet):
    serializer_class = ContactInfoSerializer
    model = ContactInfo

    def get_queryset(self):
        person = self._get_person()
        return ContactInfo.objects.filter(person=person)


class ImportantDateViewSet(_PersonScopedViewSet):
    serializer_class = ImportantDateSerializer
    model = ImportantDate

    def get_queryset(self):
        person = self._get_person()
        return ImportantDate.objects.filter(person=person)

    @action(detail=False, methods=["get"], url_path="upcoming")
    def upcoming(self, request, person_pk=None, person_id=None, **kwargs):
        person = self._get_person()
        days = _int_query_param(request, "days", 30, 0, 3650)
        result = []
        for d in person.important_dates.all():
            nxt = d.days_until_next()
            if nxt is not None and 0 <= nxt <= days:
                result.append(d)
        result.sort(key=lambda d: d.days_until_next() or 0)
        return Response(ImportantDateSerializer(result, many=True).data)


class InteractionViewSet(_PersonScopedViewSet):
    serializer_class = InteractionSerializer
    model = Interaction

    def get_queryset(self):
        person = self._get_person()
        qs = (
            Interaction.objects.filter(person=person)
            .select_related("person")
            .order_by("-occurred_at")
        )
        # Filter ?counts_as_contact=true
        if self.request.query_params.get("counts_as_contact") in ("true", "1"):
            qs = qs.filter(counts_as_contact=True)
        return qs


class NoteViewSet(_PersonScopedViewSet):
    serializer_class = NoteSerializer
    model = Note

    def get_queryset(self):
        person = self._get_person()
        qs = Note.objects.filter(person=person).order_by("-created_at")
        cat = self.request.query_params.get("category")
        if cat:
            qs = qs.filter(category=cat)
        return qs


# ---------------------------------------------------------------------------
# Reminder - flat (not nested); a reminder may or may not have a person.
# ---------------------------------------------------------------------------


class ReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        qs = (
            Reminder.objects.filter(owner=self.request.user)
            .select_related("person")
            .prefetch_related("participants")
        )
        params = self.request.query_params
        if params.get("completed") in ("false", "0"):
            qs = qs.filter(completed=False)
        elif params.get("completed") in ("true", "1"):
            qs = qs.filter(completed=True)
        status_param = params.get("status")
        if status_param in dict(Reminder.STATUS_CHOICES):
            qs = qs.filter(status=status_param)
        kind = params.get("kind")
        if kind in dict(Reminder.KIND_CHOICES):
            qs = qs.filter(kind=kind)
        if params.get("upcoming") in ("true", "1"):
            qs = qs.filter(remind_at__gte=timezone.now())
        person_id = _id_query_param(self.request, "person_id")
        if person_id is not None:
            qs = qs.filter(person_id=person_id)
        # Optional ordering: ?ordering=-updated_at (latest completed, board).
        if params.get("ordering") in ("-updated_at", "updated_at", "-remind_at", "remind_at"):
            qs = qs.order_by(params["ordering"])
        # Lists only: ?limit=N truncates the result.
        if self.action == "list":
            try:
                limit = int(params.get("limit", "0"))
            except (TypeError, ValueError):
                limit = 0
            if limit > 0:
                qs = qs[: min(limit, 500)]
        return qs

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        """
        Marks the reminder as completed. If recur=yearly and person_id is
        set, fires the signal that creates an Interaction automatically.
        """
        reminder = self.get_object()
        if reminder.completed:
            return Response({"detail": "Reminder ya estaba completado."},
                            status=status.HTTP_400_BAD_REQUEST)
        reminder.completed = True
        if "title" in request.data:
            reminder.title = request.data["title"]
        reminder.save()
        return Response(ReminderSerializer(reminder).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Organization - institutions and their members. Owner-scoped.
# ---------------------------------------------------------------------------


class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    # JSON for simple fields; multipart for the logo (`logo=null` deletes it).
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = (
            Organization.objects.filter(owner=self.request.user)
            .prefetch_related("tags")
            .annotate(_member_count=Count("memberships__person", distinct=True))
        )
        params = self.request.query_params
        search = params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(city__icontains=search))
        kind = params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        tag = _id_query_param(self.request, "tag")
        if tag is not None:
            qs = qs.filter(tags__id=tag)
        return qs

    def perform_destroy(self, instance):
        # Logo and attachment files live on disk: delete them too.
        from crm_attachment.models import Attachment
        from django.contrib.contenttypes.models import ContentType

        if instance.logo:
            instance.logo.delete(save=False)
        ct = ContentType.objects.get_for_model(Organization)
        for att in Attachment.objects.filter(subject_type=ct, subject_id=instance.pk):
            if att.file:
                try:
                    att.file.delete(save=False)
                except Exception:
                    pass
            att.delete()
        instance.delete()

    def _member_serializer(self, organization, **kwargs):
        context = {**self.get_serializer_context(), "organization": organization}
        return PersonOrganizationSerializer(context=context, **kwargs)

    @action(detail=True, methods=["get", "post"], url_path="members")
    def members(self, request, pk=None):
        organization = self.get_object()
        if request.method == "GET":
            rows = (
                PersonOrganization.objects.filter(organization=organization)
                .select_related("person")
                .order_by("-is_current", "person__first_name", "person__last_name")
            )
            return Response(self._member_serializer(organization, instance=rows, many=True).data)
        serializer = self._member_serializer(organization, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(organization=organization)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"members/(?P<membership_id>\d+)",
    )
    def member_detail(self, request, pk=None, membership_id=None):
        organization = self.get_object()
        membership = get_object_or_404(
            PersonOrganization.objects.select_related("person"),
            pk=membership_id, organization=organization,
        )
        if request.method == "DELETE":
            membership.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = self._member_serializer(
            organization, instance=membership, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Dashboard - aggregated feed for the home page.
# ---------------------------------------------------------------------------


# Limits for the home page cards (spec v5 H2).
DASHBOARD_PENDING_LIMIT = 8
DASHBOARD_UPCOMING_DATES_LIMIT = 6
DASHBOARD_UPCOMING_DAYS = 30
DASHBOARD_SUGGESTIONS_LIMIT = 6
SUGGESTION_SOON_DAYS = 3  # same window as Person.cadence_status ("due_soon")
SUGGESTION_FREQUENT_WINDOW_DAYS = 90
SUGGESTION_FREQUENT_MIN = 3


def _int_query_param(request, name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(int(request.query_params.get(name, default)), high))
    except (TypeError, ValueError):
        return default


def _suggestion_candidates(user, now, exclude_ids: set[int], limit: int) -> list[dict]:
    """Persons suggested for contact: [{id, reason, days}] in priority order.

    Only the `user`'s persons, never favorites nor those in `exclude_ids`. A person
    appears only once, with the first reason that applies:
      1. overdue          cadence past due; days = days overdue (minimum 1, rounded down).
      2. due_soon         due in <= 3 days; days = days remaining.
      3. frequent         >= 3 interactions counting as contact in 90 days;
                          days = days since the last contact (None if there is none).
      4. never_contacted  with a cadence defined and no contact at all; days = None.
    Each reason is a bounded query with annotations (without loading all persons).
    """
    day = timedelta(days=1)
    soon_limit = now + SUGGESTION_SOON_DAYS * day
    base = Person.objects.filter(owner=user, favorite=False)
    due_at = ExpressionWrapper(
        F("last_contacted_at") + F("cadence_days") * day, output_field=DateTimeField(),
    )
    with_cadence = base.filter(
        cadence_days__isnull=False, last_contacted_at__isnull=False,
    ).annotate(due_at=due_at)

    picked: list[dict] = []
    taken: set[int] = set(exclude_ids)

    def take(rows, reason: str, days_of):
        for pid, *rest in rows:
            if len(picked) >= limit:
                return
            if pid in taken:
                continue
            taken.add(pid)
            picked.append({"id": pid, "reason": reason, "days": days_of(*rest)})

    if len(picked) < limit:
        rows = (
            with_cadence.filter(due_at__lt=now).exclude(pk__in=taken)
            .order_by("due_at", "pk").values_list("pk", "due_at")[:limit]
        )
        take(rows, "overdue", lambda due: max(1, int((now - due) / day)))
    if len(picked) < limit:
        rows = (
            with_cadence.filter(due_at__gte=now, due_at__lt=soon_limit).exclude(pk__in=taken)
            .order_by("due_at", "pk").values_list("pk", "due_at")[:limit]
        )
        take(rows, "due_soon", lambda due: max(0, int((due - now) / day)))
    if len(picked) < limit:
        since = now - SUGGESTION_FREQUENT_WINDOW_DAYS * day
        rows = (
            base.exclude(pk__in=taken)
            .annotate(
                recent_contacts=Count(
                    "interactions",
                    filter=Q(
                        interactions__counts_as_contact=True,
                        interactions__occurred_at__gte=since,
                    ),
                )
            )
            .filter(recent_contacts__gte=SUGGESTION_FREQUENT_MIN)
            .order_by("-recent_contacts", F("last_contacted_at").desc(nulls_last=True), "pk")
            .values_list("pk", "last_contacted_at")[:limit]
        )
        take(
            rows, "frequent",
            lambda last: None if last is None else max(0, int((now - last) / day)),
        )
    if len(picked) < limit:
        rows = (
            base.filter(cadence_days__isnull=False, last_contacted_at__isnull=True)
            .exclude(pk__in=taken).order_by("created_at", "pk").values_list("pk")[:limit]
        )
        take(rows, "never_contacted", lambda: None)
    return picked


class DashboardViewSet(viewsets.ViewSet):
    """Home feed. Everything owner-scoped.

    Keys: calendar, recent, favorite_count, favorites, upcoming_important_dates
    (next 30 days, max 6, with `person_name`), pending_reminders (todo/in_progress,
    overdue first, max 8) with `pending_reminders_total`, and suggestions
    (`[{person, reason, days}]`, see `_suggestion_candidates`).
    """

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        user = request.user
        now = timezone.now()
        persons_qs = (
            Person.objects.filter(owner=user)
            .select_related("owner")
            .prefetch_related("tags", "contacts_info", _memberships_prefetch())
            .annotate(
                _notes_count=Count("notes", distinct=True),
                _interactions_count=Count("interactions", distinct=True),
            )
        )

        # ---- Important dates: a single query (without loading full persons) and
        # days computed once. The calendar asks for up to ?calendar_days=N (default 60);
        # "upcoming dates" are the first 30 days.
        calendar_days = _int_query_param(request, "calendar_days", 60, 1, 365)
        horizon = max(calendar_days, DASHBOARD_UPCOMING_DAYS)
        dated = []  # [(days, ImportantDate)]
        for d in ImportantDate.objects.filter(person__owner=user).select_related("person"):
            nxt = d.days_until_next()
            if nxt is not None and 0 <= nxt <= horizon:
                dated.append((nxt, d))
        dated.sort(key=lambda pair: (pair[0], pair[1].pk))
        calendar_events = [d for nxt, d in dated if nxt <= calendar_days]
        upcoming_dates = [d for nxt, d in dated if nxt <= DASHBOARD_UPCOMING_DAYS][
            :DASHBOARD_UPCOMING_DATES_LIMIT
        ]

        # ---- Recent persons: the last N created (default 10).
        recent_limit = _int_query_param(request, "recent_limit", 10, 1, 50)
        recent_persons = list(persons_qs.order_by("-created_at")[:recent_limit])

        # ---- Favorites: count and list (top 10 for the home card).
        favorites_qs = persons_qs.filter(favorite=True).order_by("-updated_at")
        favorite_count = favorites_qs.count()
        favorite_persons = list(favorites_qs[:10])

        # ---- Pending: todo / in_progress, by remind_at (overdue ones come first).
        pending_qs = Reminder.objects.filter(owner=user, status__in=("todo", "in_progress"))
        pending_total = pending_qs.count()
        pending_reminders = list(
            pending_qs.prefetch_related("participants").order_by("remind_at", "pk")[
                :DASHBOARD_PENDING_LIMIT
            ]
        )

        # ---- Suggestions: non-favorites, without repeating those in "upcoming dates".
        exclude_ids = {d.person_id for d in upcoming_dates}
        candidates = _suggestion_candidates(user, now, exclude_ids, DASHBOARD_SUGGESTIONS_LIMIT)
        suggested = {p.pk: p for p in persons_qs.filter(pk__in=[c["id"] for c in candidates])}
        suggestions = [
            {
                "person": PersonSerializer(suggested[c["id"]]).data,
                "reason": c["reason"],
                "days": c["days"],
            }
            for c in candidates
            if c["id"] in suggested
        ]

        return Response({
            "calendar": self._dates_payload(calendar_events),
            "recent": PersonSerializer(recent_persons, many=True).data,
            "favorite_count": favorite_count,
            "favorites": PersonSerializer(favorite_persons, many=True).data,
            "upcoming_important_dates": self._dates_payload(upcoming_dates),
            "pending_reminders": ReminderSerializer(pending_reminders, many=True).data,
            "pending_reminders_total": pending_total,
            "suggestions": suggestions,
        })

    @staticmethod
    def _dates_payload(dates):
        """Serialized ImportantDates, with `person_name` (for avatar and name on the home page)."""
        data = ImportantDateSerializer(dates, many=True).data
        for row, d in zip(data, dates):
            row["person_name"] = d.person.display_name
        return data
