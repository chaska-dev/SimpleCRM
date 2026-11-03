"""
Import and export contacts (spec v6 K).

Formats:
- vCard `.vcf`: 2.1 (Android, with QUOTED-PRINTABLE), 3.0 (iPhone / iCloud / Google) and 4.0.
- Google Contacts CSV: current format ("First Name", "Phone 1 - Value") and the old one
  ("Given Name", "Phone 1 - Type").

The module does not touch HTTP: `parse_upload` reads a file and returns `ParsedFile`;
`preview` / `run_import` work with the already-parsed contacts and `export_*`
generate the download text. The views live in `crm/views.py`.

Rules:
- Everything owner-scoped (`user` is the owner).
- Writes reuse the DRF serializers (same validation and note encryption
  as in REST) and `created_via="import"`.
- vobject 0.9.9 does not understand the QUOTED-PRINTABLE soft line breaks of vCard 2.1
  (`=` at end of line) nor the per-property CHARSET: `_prepare_card` decodes
  them before handing the card to vobject.
"""

from __future__ import annotations

import csv
import io
import quopri
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urlparse

import vobject
from django.db import transaction

from .models import ContactInfo, Person
from .serializers import (
    ContactInfoSerializer,
    ImportantDateSerializer,
    NoteSerializer,
    PersonSerializer,
)
from .services import ServiceError, _ctx, _validate, resolve_tags

MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_CONTACTS = 5000
PREVIEW_ROWS = 50

FORMAT_VCARD = "vcard"
FORMAT_GOOGLE_CSV = "google_csv"

DUPLICATE_MODES = ("skip", "merge", "create")

# "No year" sentinel used by Apple (1604) and a leap year to store month/day.
APPLE_NO_YEAR = 1604
LEAP_PLACEHOLDER_YEAR = 2000
MIN_BIRTH_YEAR = 1900

PHONE_TYPES = ("personal_phone", "work_phone", "whatsapp")
EMAIL_TYPES = ("personal_email", "work_email")

# Column limits of the models (values are truncated instead of failing).
_FIRST_MAX, _LAST_MAX, _NICK_MAX, _COMPANY_MAX, _ROLE_MAX = 100, 100, 50, 200, 150
_VALUE_MAX, _LABEL_MAX, _TAG_MAX = 200, 50, 50


class ImportFileError(Exception):
    """File cannot be imported (size, format, limit). The message goes to the user (400)."""


# ---------------------------------------------------------------------------
# Intermediate model
# ---------------------------------------------------------------------------


@dataclass
class Channel:
    type: str  # ContactInfo.type
    value: str
    label: str = ""


@dataclass
class ParsedContact:
    row: int
    first_name: str = ""
    last_name: str = ""
    nick_name: str = ""
    company: str = ""
    role: str = ""
    channels: list[Channel] = field(default_factory=list)
    birthday: tuple[int, int, int | None] | None = None  # (month, day, year|None)
    note: str = ""
    addresses: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    favorite: bool = False

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def phones(self) -> list[str]:
        return [c.value for c in self.channels if c.type in PHONE_TYPES]

    @property
    def emails(self) -> list[str]:
        return [c.value for c in self.channels if c.type in EMAIL_TYPES]

    @property
    def note_text(self) -> str:
        """Note + addresses as text (the address has no field of its own)."""
        parts = [self.note.strip()] if self.note.strip() else []
        parts.extend(f"Dirección: {a}" for a in self.addresses)
        return "\n\n".join(parts)

    def birthday_text(self) -> str | None:
        if not self.birthday:
            return None
        month, day, year = self.birthday
        if year:
            return f"{year:04d}-{month:02d}-{day:02d}"
        return f"--{month:02d}-{day:02d}"


@dataclass
class ParsedFile:
    format: str
    contacts: list[ParsedContact]
    errors: list[dict]


# ---------------------------------------------------------------------------
# Normalization and text utilities
# ---------------------------------------------------------------------------


def phone_key(value: str) -> str:
    """Digits only, last 9. Empty if there are too few digits to compare."""
    digits = re.sub(r"\D", "", value or "")
    return digits[-9:] if len(digits) >= 7 else ""


def email_key(value: str) -> str:
    return (value or "").strip().lower()


def name_key(first: str, last: str = "") -> str:
    text = f"{first or ''} {last or ''}"
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().split())


def _channel_key(ch_type: str, value: str) -> tuple[str, str]:
    if ch_type in PHONE_TYPES:
        return ("phone", phone_key(value) or re.sub(r"\D", "", value))
    if ch_type in EMAIL_TYPES:
        return ("email", email_key(value))
    return (ch_type, (value or "").strip().lower())


def _clip(value: str, size: int) -> str:
    return " ".join((value or "").split())[:size]


def _clean_label(raw: str) -> str:
    """`_$!<HomePage>!$_` (Apple) -> `HomePage`."""
    m = re.fullmatch(r"_\$!<(.*)>!\$_", (raw or "").strip())
    return _clip(m.group(1) if m else raw, _LABEL_MAX)


_SOCIAL_DOMAINS = (
    ("instagram.com", "instagram"),
    ("instagr.am", "instagram"),
    ("facebook.com", "facebook"),
    ("fb.com", "facebook"),
    ("fb.me", "facebook"),
    ("twitter.com", "x"),
    ("x.com", "x"),
    ("linkedin.com", "linkedin"),
    ("t.me", "telegram"),
    ("telegram.me", "telegram"),
    ("telegram.org", "telegram"),
)
_SOCIAL_HINTS = {
    "instagram": "instagram",
    "facebook": "facebook",
    "twitter": "x",
    "x": "x",
    "linkedin": "linkedin",
    "telegram": "telegram",
    "discord": "discord",
}


def social_type(value: str, hint: str = "") -> str:
    """ContactInfo type for a URL / profile: by domain, then by hint, otherwise `other`."""
    text = (value or "").strip()
    host = ""
    try:
        parsed = urlparse(text if "://" in text else f"//{text}")
        host = (parsed.hostname or "").lower()
    except ValueError:
        host = ""
    for domain, kind in _SOCIAL_DOMAINS:
        if host == domain or host.endswith("." + domain):
            return kind
    return _SOCIAL_HINTS.get((hint or "").strip().lower(), "other")


_BDAY_FULL = re.compile(r"^(\d{4})-?(\d{2})-?(\d{2})(?:[T ].*)?$")
_BDAY_NO_YEAR = re.compile(r"^--(\d{2})-?(\d{2})$")


def parse_birthday(raw: str) -> tuple[int, int, int | None] | None:
    """`YYYY-MM-DD`, `YYYYMMDD`, `--MMDD`, `--MM-DD` -> (month, day, year|None).

    Apple's year 1604 (and any year outside 1900..today) counts as "no year".
    Feb 29 is valid (it is validated against a leap year).
    """
    text = (raw or "").strip()
    year: int | None = None
    m = _BDAY_FULL.match(text)
    if m:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = _BDAY_NO_YEAR.match(text)
        if not m:
            return None
        month, day = int(m.group(1)), int(m.group(2))
    try:
        date(LEAP_PLACEHOLDER_YEAR, month, day)
    except ValueError:
        return None
    if year is not None and (
        year == APPLE_NO_YEAR or not (MIN_BIRTH_YEAR <= year <= date.today().year)
    ):
        year = None
    if year is not None:
        try:
            date(year, month, day)
        except ValueError:  # Feb 29 in a non-leap year
            year = None
    return month, day, year


def _add_channel(contact: ParsedContact, ch_type: str, value: str, label: str = "") -> None:
    value = " ".join((value or "").split())
    if not value or len(value) > _VALUE_MAX:
        return
    key = _channel_key(ch_type, value)
    if any(_channel_key(c.type, c.value) == key for c in contact.channels):
        return
    contact.channels.append(Channel(ch_type, value, _clip(label, _LABEL_MAX)))


def _split_full_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split(None, 1)
    if not parts:
        return "", ""
    return parts[0], parts[1] if len(parts) > 1 else ""


def _finish(contact: ParsedContact, fallback_full: str = "") -> str | None:
    """Fill in the name and truncate to the model limits. Returns an error or None."""
    if not contact.first_name and not contact.last_name:
        if fallback_full:
            contact.first_name, contact.last_name = _split_full_name(fallback_full)
        elif contact.nick_name:
            contact.first_name = contact.nick_name
        elif contact.company:
            contact.first_name = contact.company
    contact.first_name = _clip(contact.first_name, _FIRST_MAX)
    contact.last_name = _clip(contact.last_name, _LAST_MAX)
    contact.nick_name = _clip(contact.nick_name, _NICK_MAX)
    contact.company = _clip(contact.company, _COMPANY_MAX)
    contact.role = _clip(contact.role, _ROLE_MAX)
    if not contact.first_name:
        return "Contacto sin nombre."
    return None


# ---------------------------------------------------------------------------
# Reading files
# ---------------------------------------------------------------------------


def decode_text(raw: bytes) -> str:
    """UTF-8 (with or without BOM), UTF-16 with BOM; otherwise cp1252."""
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def detect_format(text: str, filename: str = "") -> str:
    head = text[:4096].lstrip("﻿ \t\r\n")
    if re.match(r"BEGIN:VCARD", head, re.IGNORECASE):
        return FORMAT_VCARD
    first_line = head.splitlines()[0] if head else ""
    headers = {h.strip().strip('"') for h in first_line.split(",")}
    if headers & {"First Name", "Given Name", "Family Name", "Last Name", "Name"}:
        return FORMAT_GOOGLE_CSV
    raise ImportFileError(
        "Formato de archivo no reconocido. Usa un .vcf o un CSV de Google Contacts."
    )


def parse_upload(raw: bytes, filename: str = "") -> ParsedFile:
    """Validate size, detect the format and parse. Raises `ImportFileError` (400)."""
    if not raw:
        raise ImportFileError("El archivo está vacío.")
    if len(raw) > MAX_IMPORT_BYTES:
        raise ImportFileError(
            f"El archivo excede el límite de {MAX_IMPORT_BYTES // (1024 * 1024)} MB."
        )
    text = decode_text(raw)
    fmt = detect_format(text, filename)
    if fmt == FORMAT_VCARD:
        return parse_vcards(text)
    return parse_google_csv(text)


def _too_many() -> ImportFileError:
    return ImportFileError(
        f"El archivo tiene más de {MAX_IMPORT_CONTACTS} contactos. Divídelo en partes más pequeñas."
    )


# ----- vCard ---------------------------------------------------------------

_CARD_RE = re.compile(r"BEGIN:VCARD.*?END:VCARD", re.IGNORECASE | re.DOTALL)
_DROP_PROPS = {"PHOTO", "LOGO", "SOUND", "KEY"}
_STRUCTURED_PROPS = {"N", "ORG", "ADR", "CATEGORIES", "GEO"}


def _is_qp_header(header: str) -> bool:
    return "QUOTED-PRINTABLE" in header.upper()


def _prepare_card(card_text: str) -> str:
    """Unfold lines and decode QUOTED-PRINTABLE (vCard 2.1) to plain vCard text."""
    physical = card_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    logical: list[str] = []
    soft_break = False
    for raw in physical:
        if soft_break:
            logical[-1] += raw
        elif raw[:1] in (" ", "\t") and logical:
            logical[-1] += raw[1:]
        else:
            logical.append(raw)
        head = logical[-1].split(":", 1)[0] if logical else ""
        soft_break = _is_qp_header(head) and logical[-1].endswith("=")
        if soft_break:
            logical[-1] = logical[-1][:-1]

    out: list[str] = []
    for line in logical:
        if not line.strip() or ":" not in line:
            continue
        header, value = line.split(":", 1)
        params = header.split(";")
        name = params[0].split(".")[-1].upper()
        if name in _DROP_PROPS:
            continue
        # vCard 2.1: nameless parameters (`TEL;CELL;PREF`) -> `TYPE=CELL;TYPE=PREF`.
        params = [params[0]] + [
            p if "=" in p or not p.strip() or _is_qp_header(p) else f"TYPE={p.strip()}"
            for p in params[1:]
        ]
        header = ";".join(params)
        if _is_qp_header(header):
            charset = "utf-8"
            kept = [params[0]]
            for p in params[1:]:
                up = p.strip().upper()
                if up in ("QUOTED-PRINTABLE", "ENCODING=QUOTED-PRINTABLE"):
                    continue
                if up.startswith("CHARSET="):
                    charset = p.split("=", 1)[1].strip().strip('"') or "utf-8"
                    continue
                kept.append(p)
            data = quopri.decodestring(value.encode("utf-8", "replace"))
            try:
                text = data.decode(charset)
            except (LookupError, UnicodeDecodeError):
                try:
                    text = data.decode("utf-8")
                except UnicodeDecodeError:
                    text = data.decode("cp1252", errors="replace")
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            text = text.replace("\\", "\\\\").replace("\n", "\\n")
            if name not in _STRUCTURED_PROPS:
                text = text.replace(";", "\\;").replace(",", "\\,")
            line = ";".join(kept) + ":" + text
        else:
            line = header + ":" + value
        out.append(line)
    return "\r\n".join(out) + "\r\n"


def _s(value) -> str:
    """vobject value (str or list) to text."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(_s(v) for v in value if _s(v))
    return str(value).strip()


def _types(child) -> list[str]:
    result: list[str] = []
    for key in ("TYPE",):
        for item in child.params.get(key, []):
            result.extend(p.strip().upper() for p in str(item).split(",") if p.strip())
    return result


_LABEL_IGNORED_TYPES = {"PREF", "INTERNET", "VOICE", "X-INTERNET"}


def _type_label(types: list[str]) -> str:
    useful = [t for t in types if t not in _LABEL_IGNORED_TYPES]
    return ",".join(useful or [t for t in types if t == "VOICE"])


def _contact_from_card(row: int, card) -> tuple[ParsedContact | None, str | None]:
    contact = ParsedContact(row=row)
    children = list(card.getChildren())
    group_labels = {
        ch.group: _clean_label(_s(ch.value))
        for ch in children
        if ch.name.upper() == "X-ABLABEL" and getattr(ch, "group", None)
    }
    fn = ""
    for ch in children:
        name = ch.name.upper()
        group = getattr(ch, "group", None)
        if name == "N":
            v = ch.value
            given = _s(getattr(v, "given", ""))
            middle = _s(getattr(v, "additional", ""))
            contact.first_name = f"{given} {middle}".strip()
            contact.last_name = _s(getattr(v, "family", ""))
        elif name == "FN":
            fn = _s(ch.value)
        elif name == "NICKNAME":
            contact.nick_name = _s(ch.value)
        elif name == "ORG":
            items = ch.value if isinstance(ch.value, (list, tuple)) else [ch.value]
            contact.company = _s(items[0]) if items else ""
        elif name == "TITLE":
            contact.role = _s(ch.value)
        elif name == "TEL":
            types = _types(ch)
            value = re.sub(r"^tel:", "", _s(ch.value), flags=re.IGNORECASE)
            kind = "work_phone" if "WORK" in types else "personal_phone"
            _add_channel(contact, kind, value, group_labels.get(group) or _type_label(types))
        elif name == "EMAIL":
            types = _types(ch)
            kind = "work_email" if "WORK" in types else "personal_email"
            _add_channel(contact, kind, _s(ch.value), group_labels.get(group) or _type_label(types))
        elif name == "URL":
            value = _s(ch.value)
            _add_channel(contact, social_type(value), value, group_labels.get(group, ""))
        elif name == "X-SOCIALPROFILE":
            hint = (_types(ch) or [""])[0].lower()
            value = re.sub(r"^x-apple:", "", _s(ch.value), flags=re.IGNORECASE)
            _add_channel(contact, social_type(value, hint), value, hint)
        elif name == "BDAY":
            contact.birthday = parse_birthday(_s(ch.value)) or contact.birthday
        elif name == "NOTE":
            note = _s(ch.value)
            contact.note = f"{contact.note}\n{note}".strip() if contact.note else note
        elif name == "ADR":
            v = ch.value
            parts = [
                _s(getattr(v, attr, ""))
                for attr in ("box", "extended", "street", "city", "region", "code", "country")
            ]
            text = ", ".join(p for p in parts if p)
            if text:
                contact.addresses.append(text)
        elif name == "CATEGORIES":
            items = ch.value if isinstance(ch.value, (list, tuple)) else [ch.value]
            contact.categories.extend(_s(i) for i in items if _s(i))
    error = _finish(contact, fallback_full=fn)
    if error:
        return None, error
    return contact, None


def parse_vcards(text: str) -> ParsedFile:
    cards = _CARD_RE.findall(text)
    if len(cards) > MAX_IMPORT_CONTACTS:
        raise _too_many()
    contacts: list[ParsedContact] = []
    errors: list[dict] = []
    for index, card_text in enumerate(cards, start=1):
        try:
            card = vobject.readOne(_prepare_card(card_text))
            contact, error = _contact_from_card(index, card)
        except Exception:  # vobject raises several types; each bad card is isolated
            errors.append({"row": index, "message": "No se pudo leer la tarjeta vCard."})
            continue
        if error:
            errors.append({"row": index, "message": error})
        else:
            contacts.append(contact)
    return ParsedFile(FORMAT_VCARD, contacts, errors)


# ----- Google CSV ----------------------------------------------------------

_MULTI_COL = re.compile(r"^(E-mail|Phone|Website|Address) (\d+) - (Label|Type|Value|Formatted)$")
_LIST_SEP = " ::: "


def _split_multi(cell: str) -> list[str]:
    return [p.strip() for p in (cell or "").split(":::") if p.strip()]


def _csv_label(raw: str) -> str:
    """Google label; a lone `*` (no type) counts as empty."""
    return _clip((raw or "").strip().lstrip("*").strip(), _LABEL_MAX)


def parse_google_csv(text: str) -> ParsedFile:
    reader = csv.DictReader(io.StringIO(text, newline=""))
    headers = [(h or "").strip() for h in (reader.fieldnames or [])]
    reader.fieldnames = headers
    # Repeatable columns grouped by (type, number).
    groups: dict[tuple[str, int], dict[str, str]] = {}
    for h in headers:
        m = _MULTI_COL.match(h)
        if m:
            groups.setdefault((m.group(1), int(m.group(2))), {})[m.group(3)] = h
    ordered = sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1]))

    def cell(row: dict, *names: str) -> str:
        for n in names:
            v = row.get(n)
            if v and v.strip():
                return v.strip()
        return ""

    contacts: list[ParsedContact] = []
    errors: list[dict] = []
    index = 0
    for raw_row in reader:
        row = {(k or "").strip(): (v or "") for k, v in raw_row.items() if k is not None}
        if not any(v.strip() for v in row.values()):
            continue
        index += 1
        if index > MAX_IMPORT_CONTACTS:
            raise _too_many()
        contact = ParsedContact(row=index)
        given = cell(row, "First Name", "Given Name")
        middle = cell(row, "Middle Name", "Additional Name")
        contact.first_name = f"{given} {middle}".strip()
        contact.last_name = cell(row, "Last Name", "Family Name")
        contact.nick_name = cell(row, "Nickname")
        contact.company = cell(row, "Organization Name", "Organization 1 - Name")
        contact.role = cell(row, "Organization Title", "Organization 1 - Title")
        contact.note = cell(row, "Notes")
        contact.birthday = parse_birthday(cell(row, "Birthday"))
        for label in _split_multi(cell(row, "Labels", "Group Membership")):
            if label.startswith("*"):
                if label.lstrip("* ").lower() == "starred":
                    contact.favorite = True
                continue
            contact.categories.append(label)
        for (kind, _n), cols in ordered:
            label = _csv_label(row.get(cols.get("Label", ""), "") or row.get(cols.get("Type", ""), ""))
            value_col = cols.get("Value") or cols.get("Formatted")
            if not value_col:
                continue
            raw_value = row.get(value_col, "")
            if kind == "Address":
                values = [", ".join(p.strip() for p in raw_value.splitlines() if p.strip())]
            else:
                values = _split_multi(raw_value)
            for value in values:
                if not value:
                    continue
                lower = label.lower()
                is_work = any(w in lower for w in ("work", "trabajo", "oficina"))
                if kind == "Phone":
                    _add_channel(contact, "work_phone" if is_work else "personal_phone", value, label)
                elif kind == "E-mail":
                    _add_channel(contact, "work_email" if is_work else "personal_email", value, label)
                elif kind == "Website":
                    _add_channel(contact, social_type(value, label), value, label)
                else:
                    contact.addresses.append(value)
        error = _finish(contact, fallback_full=cell(row, "Name"))
        if error:
            errors.append({"row": index, "message": error})
        else:
            contacts.append(contact)
    return ParsedFile(FORMAT_GOOGLE_CSV, contacts, errors)


# ---------------------------------------------------------------------------
# Duplicates
# ---------------------------------------------------------------------------


class DuplicateIndex:
    """Index of the owner's persons by phone (last 9 digits), email and name."""

    def __init__(self, user):
        self.user = user
        self.by_phone: dict[str, int] = {}
        self.by_email: dict[str, int] = {}
        self.by_name: dict[str, int] = {}
        self.names: dict[int, str] = {}
        for pk, first, last, nick in Person.objects.filter(owner=user).values_list(
            "pk", "first_name", "last_name", "nick_name",
        ).order_by("pk"):
            self.names[pk] = f"{first} {last}".strip() or nick or f"#{pk}"
            self.by_name.setdefault(name_key(first, last), pk)
        for pk, ctype, value in ContactInfo.objects.filter(
            person__owner=user, type__in=PHONE_TYPES + EMAIL_TYPES,
        ).values_list("person_id", "type", "value").order_by("pk"):
            if ctype in PHONE_TYPES:
                key = phone_key(value)
                if key:
                    self.by_phone.setdefault(key, pk)
            else:
                key = email_key(value)
                if key:
                    self.by_email.setdefault(key, pk)

    def find(self, contact: ParsedContact) -> int | None:
        """Id of the matching existing person, or None."""
        for value in contact.phones:
            key = phone_key(value)
            if key and key in self.by_phone:
                return self.by_phone[key]
        for value in contact.emails:
            key = email_key(value)
            if key and key in self.by_email:
                return self.by_email[key]
        key = name_key(contact.first_name, contact.last_name)
        return self.by_name.get(key) if key else None


# ---------------------------------------------------------------------------
# Preview and import
# ---------------------------------------------------------------------------


def preview(user, parsed: ParsedFile) -> dict:
    index = DuplicateIndex(user)
    rows = []
    duplicates = 0
    for contact in parsed.contacts:
        dup_id = index.find(contact)
        if dup_id is not None:
            duplicates += 1
        if len(rows) < PREVIEW_ROWS:
            rows.append({
                "row": contact.row,
                "name": contact.full_name,
                "company": contact.company,
                "phones": contact.phones,
                "emails": contact.emails,
                "birthday": contact.birthday_text(),
                "duplicate_of": (
                    {"id": dup_id, "name": index.names.get(dup_id, "")}
                    if dup_id is not None else None
                ),
            })
    return {
        "format": parsed.format,
        "total": len(parsed.contacts) + len(parsed.errors),
        "new": len(parsed.contacts) - duplicates,
        "duplicates": duplicates,
        "errors": parsed.errors,
        "rows": rows,
    }


class _TagCache:
    def __init__(self, user):
        self.user = user
        self.cache = {}

    def get(self, names: list[str]):
        result = []
        for raw in names:
            name = _clip(raw, _TAG_MAX)
            if not name:
                continue
            key = name.lower()
            if key not in self.cache:
                found = resolve_tags(self.user, [name])
                self.cache[key] = found[0] if found else None
            if self.cache[key] is not None and self.cache[key] not in result:
                result.append(self.cache[key])
        return result


def _save_channel(user, person, channel: Channel) -> None:
    ser = ContactInfoSerializer(
        data={"type": channel.type, "value": channel.value, "label": channel.label},
    )
    _validate(ser)
    ser.save(person=person, created_via="import")


def _save_birthday(user, person, birthday: tuple[int, int, int | None]) -> None:
    month, day, year = birthday
    base = date(year or LEAP_PLACEHOLDER_YEAR, month, day)
    ser = ImportantDateSerializer(data={
        "kind": "birthday", "title": "Cumpleaños", "icon": "cake",
        "date": base.isoformat(), "birth_year": year, "recurrence": "yearly",
    })
    _validate(ser)
    ser.save(person=person, created_via="import")


def _save_note(user, person, text: str) -> None:
    ser = NoteSerializer(data={"body": text, "category": "general"})
    _validate(ser)
    ser.save(person=person, created_via="import")


def _create_person(user, contact: ParsedContact, tags) -> Person:
    ser = PersonSerializer(
        data={
            "first_name": contact.first_name, "last_name": contact.last_name,
            "nick_name": contact.nick_name, "company": contact.company,
            "role": contact.role, "favorite": contact.favorite,
        },
        context=_ctx(user),
    )
    _validate(ser)
    person = ser.save(created_via="import")
    for channel in contact.channels:
        _save_channel(user, person, channel)
    if contact.birthday:
        _save_birthday(user, person, contact.birthday)
    if contact.note_text:
        _save_note(user, person, contact.note_text)
    if tags:
        person.tags.add(*tags)
    return person


def _merge_person(user, person: Person, contact: ParsedContact, tags) -> None:
    """Fill in what is missing; never deletes or overwrites fields that have a value."""
    changed = []
    for attr in ("last_name", "nick_name", "company", "role"):
        if not getattr(person, attr) and getattr(contact, attr):
            setattr(person, attr, getattr(contact, attr))
            changed.append(attr)
    if contact.favorite and not person.favorite:
        person.favorite = True
        changed.append("favorite")
    if changed:
        person.save(update_fields=changed + ["updated_at"])
    existing = {
        _channel_key(ctype, value)
        for ctype, value in person.contacts_info.values_list("type", "value")
    }
    for channel in contact.channels:
        key = _channel_key(channel.type, channel.value)
        if key not in existing:
            existing.add(key)
            _save_channel(user, person, channel)
    if contact.birthday and not person.important_dates.filter(kind="birthday").exists():
        _save_birthday(user, person, contact.birthday)
    text = contact.note_text
    if text and not any(n.body_enc.strip() == text for n in person.notes.all()):
        _save_note(user, person, text)
    if tags:
        person.tags.add(*tags)


def run_import(
    user, parsed: ParsedFile, *, duplicates: str = "skip", tag_name: str = "",
    import_labels: bool = False,
) -> dict:
    """Import in a single transaction. A contact with an error is isolated (savepoint) and reported."""
    if duplicates not in DUPLICATE_MODES:
        raise ImportFileError("Opción de duplicados no válida.")
    created = merged = skipped = 0
    errors = list(parsed.errors)
    with transaction.atomic():
        index = DuplicateIndex(user)
        tag_cache = _TagCache(user)
        base_tags = tag_cache.get([tag_name]) if tag_name.strip() else []
        for contact in parsed.contacts:
            dup_id = index.find(contact)
            if dup_id is not None and duplicates == "skip":
                skipped += 1
                continue
            file_tags = tag_cache.get(contact.categories) if import_labels else []
            tags = base_tags + [t for t in file_tags if t not in base_tags]
            try:
                with transaction.atomic():
                    if dup_id is not None and duplicates == "merge":
                        person = Person.objects.get(pk=dup_id, owner=user)
                        _merge_person(user, person, contact, tags)
                        merged += 1
                    else:
                        _create_person(user, contact, tags)
                        created += 1
            except ServiceError as exc:
                errors.append({"row": contact.row, "message": str(exc)})
    return {"created": created, "merged": merged, "skipped": skipped, "errors": errors}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def _escape(text: str) -> str:
    return (
        (text or "").replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n")
        .replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")
    )


def fold_line(line: str, limit: int = 75) -> str:
    """Fold to `limit` UTF-8 octets (without splitting characters); continuation with a space."""
    if len(line.encode("utf-8")) <= limit:
        return line
    chunks: list[str] = []
    current = ""
    size = 0
    max_size = limit
    for ch in line:
        n = len(ch.encode("utf-8"))
        if size + n > max_size:
            chunks.append(current)
            current, size, max_size = "", 0, limit - 1
        current += ch
        size += n
    chunks.append(current)
    return "\r\n ".join(chunks)


def _person_birthday(person: Person) -> tuple[int, int, int | None] | None:
    for d in person.important_dates.all():
        if d.kind == "birthday":
            year = d.birth_year
            if year:
                try:
                    date(year, d.date.month, d.date.day)
                except ValueError:
                    year = None
            return d.date.month, d.date.day, year
    return None


def _person_notes_text(person: Person) -> str:
    notes = sorted(person.notes.all(), key=lambda n: (n.created_at, n.pk))
    return "\n\n".join(n.body_enc.strip() for n in notes if n.body_enc.strip())


_SOCIAL_EXPORT_LABEL = {
    "instagram": "Instagram", "facebook": "Facebook", "x": "X", "linkedin": "LinkedIn",
    "telegram": "Telegram", "discord": "Discord", "other": "Other",
}
_SOCIAL_TYPES = tuple(_SOCIAL_EXPORT_LABEL)


def export_vcards(persons, include_notes: bool = False) -> str:
    """vCard 3.0, UTF-8, CRLF, lines folded at 75 octets."""
    lines: list[str] = []
    for p in persons:
        lines += ["BEGIN:VCARD", "VERSION:3.0"]
        lines.append(f"N:{_escape(p.last_name)};{_escape(p.first_name)};;;")
        lines.append(f"FN:{_escape(p.display_name)}")
        if p.nick_name:
            lines.append(f"NICKNAME:{_escape(p.nick_name)}")
        if p.company:
            lines.append(f"ORG:{_escape(p.company)}")
        if p.role:
            lines.append(f"TITLE:{_escape(p.role)}")
        seen_phones: set[str] = set()
        for c in p.contacts_info.all():
            if c.type in PHONE_TYPES:
                key = phone_key(c.value) or c.value
                if key in seen_phones:
                    continue
                seen_phones.add(key)
                kind = "WORK" if c.type == "work_phone" else "CELL"
                lines.append(f"TEL;TYPE={kind}:{_escape(c.value)}")
            elif c.type in EMAIL_TYPES:
                kind = "WORK" if c.type == "work_email" else "HOME"
                lines.append(f"EMAIL;TYPE={kind}:{_escape(c.value)}")
            elif c.type in _SOCIAL_TYPES:
                if re.match(r"^https?://", c.value, re.IGNORECASE):
                    lines.append(f"URL:{_escape(c.value)}")
                else:
                    lines.append(f"X-SOCIALPROFILE;TYPE={c.type}:{_escape(c.value)}")
        birthday = _person_birthday(p)
        if birthday:
            month, day, year = birthday
            lines.append(f"BDAY:{year:04d}-{month:02d}-{day:02d}" if year else f"BDAY:--{month:02d}{day:02d}")
        tags = [t.name for t in p.tags.all()]
        if tags:
            lines.append("CATEGORIES:" + ",".join(_escape(t) for t in tags))
        if include_notes:
            note = _person_notes_text(p)
            if note:
                lines.append(f"NOTE:{_escape(note)}")
        lines.append("END:VCARD")
    return "".join(fold_line(line) + "\r\n" for line in lines)


_GOOGLE_BASE_COLUMNS = [
    "First Name", "Middle Name", "Last Name", "Phonetic First Name", "Phonetic Middle Name",
    "Phonetic Last Name", "Name Prefix", "Name Suffix", "Nickname", "File As",
    "Organization Name", "Organization Title", "Organization Department", "Birthday",
    "Notes", "Photo", "Labels",
]


def export_google_csv(persons, include_notes: bool = False) -> str:
    """CSV with the columns of the current Google Contacts format."""
    rows: list[dict[str, str]] = []
    max_email = max_phone = max_site = 0
    for p in persons:
        row: dict[str, str] = {
            "First Name": p.first_name, "Last Name": p.last_name, "Nickname": p.nick_name,
            "Organization Name": p.company, "Organization Title": p.role,
        }
        birthday = _person_birthday(p)
        if birthday:
            month, day, year = birthday
            row["Birthday"] = f"{year:04d}-{month:02d}-{day:02d}" if year else f"--{month:02d}-{day:02d}"
        if include_notes:
            row["Notes"] = _person_notes_text(p)
        labels = ["* myContacts"] + (["* starred"] if p.favorite else []) + [
            t.name for t in p.tags.all()
        ]
        row["Labels"] = _LIST_SEP.join(labels)
        emails = phones = sites = 0
        for c in p.contacts_info.all():
            if c.type in EMAIL_TYPES:
                emails += 1
                row[f"E-mail {emails} - Label"] = "Work" if c.type == "work_email" else "Home"
                row[f"E-mail {emails} - Value"] = c.value
            elif c.type in PHONE_TYPES:
                phones += 1
                label = {"work_phone": "Work", "whatsapp": "WhatsApp"}.get(c.type, "Mobile")
                row[f"Phone {phones} - Label"] = label
                row[f"Phone {phones} - Value"] = c.value
            elif c.type in _SOCIAL_TYPES:
                sites += 1
                row[f"Website {sites} - Label"] = _SOCIAL_EXPORT_LABEL[c.type]
                row[f"Website {sites} - Value"] = c.value
        max_email, max_phone, max_site = max(max_email, emails), max(max_phone, phones), max(max_site, sites)
        rows.append(row)
    columns = list(_GOOGLE_BASE_COLUMNS)
    for n in range(1, max_email + 1):
        columns += [f"E-mail {n} - Label", f"E-mail {n} - Value"]
    for n in range(1, max_phone + 1):
        columns += [f"Phone {n} - Label", f"Phone {n} - Value"]
    for n in range(1, max_site + 1):
        columns += [f"Website {n} - Label", f"Website {n} - Value"]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, restval="", lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()
