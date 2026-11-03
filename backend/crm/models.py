"""
Models for the CRM domain - schema v1.

Renames since 0001:
  Contact → Person
  Note.contact → Note.person
  Reminder.contact → Reminder.person
  Reminder.message → Reminder.message_enc

New tables:
  ContactInfo        (1:N with Person - multiple communication channels)
  ImportantDate      (1:N with Person - birthdays + user-defined dates)
  Interaction        (1:N with Person - log of past interactions)

Extended tables:
  Person      +nick_name, +how_we_met_enc, +cadence_days, +last_contacted_at
  Reminder    +recur, +lead_minutes, rename message→message_enc
  Note        +category

Attachments:
  Attachment lives in `crm_attachment` (separate app) with a GenericForeignKey
  to Person/Note/Interaction/ImportantDate.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.core.validators import FileExtensionValidator, MaxValueValidator
from django.db import models

from crm_attachment.models import Attachment
from .fields import EncryptedTextField


# Origin of a record: UI (forms), MCP (AI agent) or import.
CREATED_VIA_CHOICES = [
    ("ui", "Interfaz"),
    ("mcp", "Agente (MCP)"),
    ("import", "Importacion"),
]


def created_via_field() -> models.CharField:
    """Shared `created_via` field (one instance per model)."""
    return models.CharField(
        max_length=10, choices=CREATED_VIA_CHOICES, default="ui", db_default="ui",
    )


# ---------------------------------------------------------------------------
# Tag - no structural changes.
# ---------------------------------------------------------------------------


class Tag(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=50)
    color = models.CharField(
        max_length=7,
        default="#7c3aed",
        help_text="Color hex, ej: #7c3aed",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="unique_tag_per_owner"),
        ]

    def __str__(self) -> str:
        return self.name


# ---------------------------------------------------------------------------
# Person - central entity. Formerly called Contact.
# ---------------------------------------------------------------------------


class Person(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="persons",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    nick_name = models.CharField(max_length=50, blank=True, default="")
    company = models.CharField(max_length=200, blank=True, default="")
    role = models.CharField(max_length=150, blank=True, default="")

    how_we_met_enc = EncryptedTextField(blank=True, default="")
    favorite = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Marcado por el usuario como favorito/apartado especial.",
    )

    # PRM-killer: contact cadence + auto-derived last contact.
    cadence_days = models.PositiveIntegerField(
        null=True, blank=True,
        validators=[MaxValueValidator(3650)],
        help_text="Cada cuántos días quieres contactar a esta persona. Null = sin cadencia.",
    )
    last_contacted_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Auto-derivado de Interaction.counts_as_contact=True. Editable manualmente.",
    )

    tags = models.ManyToManyField(Tag, related_name="persons", blank=True)
    created_via = created_via_field()

    # Profile photo: an Attachment of this person (encrypted like the other attachments).
    # Served via /api/attachments/{id}/thumb/. Does not appear in the attachment list.
    profile_photo = models.ForeignKey(
        Attachment,
        on_delete=models.SET_NULL,
        related_name="+",
        null=True,
        blank=True,
    )

    # Associated attachments (reverse GenericRelation).
    attachments = GenericRelation(
        Attachment,
        content_type_field="subject_type",
        object_id_field="subject_id",
        related_query_name="person",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("first_name", "last_name")
        indexes = [
            models.Index(fields=["owner", "last_name"]),
            models.Index(fields=["owner", "last_contacted_at"]),
            models.Index(fields=["owner", "favorite"]),
            models.Index(fields=["owner", "-created_at"]),
        ]

    def __str__(self) -> str:
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.nick_name or f"Person #{self.pk}"

    @property
    def display_name(self) -> str:
        return str(self)

    @property
    def cadence_status(self) -> str:
        """
        'unknown' (cadence set but no contacts), 'ok' (within the cadence),
        'due_soon' (due within the next 3 days), 'overdue' (past due),
        'no_cadence' (no cadence defined).
        """
        if self.cadence_days is None:
            return "no_cadence"
        if self.last_contacted_at is None:
            return "unknown"
        from datetime import timedelta
        from django.utils import timezone
        now = timezone.now()
        next_due = self.last_contacted_at + timedelta(days=self.cadence_days)
        if now > next_due:
            return "overdue"
        if now + timedelta(days=3) > next_due:
            return "due_soon"
        return "ok"


# ---------------------------------------------------------------------------
# ContactInfo - multiple channels per person (1:N).
# ---------------------------------------------------------------------------


class ContactInfo(models.Model):
    CONTACT_TYPES = [
        ("personal_phone", "Celular personal"),
        ("personal_email", "Correo personal"),
        ("work_phone",     "Celular trabajo"),
        ("work_email",     "Correo trabajo"),
        ("whatsapp",       "WhatsApp"),
        ("telegram",       "Telegram"),
        ("instagram",      "Instagram"),
        ("facebook",       "Facebook"),
        ("x",              "X (Twitter)"),
        ("linkedin",       "LinkedIn"),
        ("discord",        "Discord"),
        ("other",          "Otro"),
    ]

    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="contacts_info",
    )
    type = models.CharField(max_length=80, choices=CONTACT_TYPES)
    value = models.CharField(max_length=200)
    label = models.CharField(max_length=50, blank=True, default="")
    created_via = created_via_field()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("type", "value")
        indexes = [
            models.Index(fields=["person", "type"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_type_display()}: {self.value}"


# ---------------------------------------------------------------------------
# ImportantDate - birthdays by default + user-defined dates.
# ---------------------------------------------------------------------------


def _anniversary_in(year: int, d):
    """Date of `d` (month+day) in `year`. Feb 29 falls on Feb 28 in non-leap years."""
    from datetime import date
    try:
        return date(year, d.month, d.day)
    except ValueError:
        return date(year, 2, 28)


class ImportantDate(models.Model):
    KIND_CHOICES = [
        ("birthday", "Cumpleaños"),
        ("custom",   "Personalizado"),
    ]
    RECURRENCE_CHOICES = [
        ("none",   "Sin recurrencia"),
        ("yearly", "Anual"),
    ]

    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="important_dates",
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="custom")

    # Only if kind=birthday. For age in the UI.
    birth_year = models.PositiveIntegerField(null=True, blank=True)

    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    icon = models.CharField(max_length=8, default="", blank=True)
    icon_image = models.ImageField(upload_to="important_dates/", blank=True, null=True)

    date = models.DateField()  # for birthday: day+month (no year)
    recurrence = models.CharField(max_length=10, choices=RECURRENCE_CHOICES, default="yearly")

    attachment = models.ForeignKey(
        Attachment,
        on_delete=models.SET_NULL,
        related_name="+",
        null=True, blank=True,
        help_text="Adjunto opcional (PDF del casamiento, audio, etc.)",
    )
    created_via = created_via_field()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("person", "date")
        indexes = [
            models.Index(fields=["person", "kind"]),
            models.Index(fields=["person", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.date})"

    def age(self, ref_year=None) -> int | None:
        """Age if it is a birthday with birth_year."""
        if self.kind != "birthday" or self.birth_year is None:
            return None
        from datetime import date
        ref = ref_year or date.today().year
        return ref - self.birth_year

    def days_until_next(self, today=None) -> int | None:
        """
        Days until the next occurrence (taking recurrence into account).
        For birthday: ignores the year and looks at month+day.
        For custom with recurrence='none': looks at the year directly.
        Feb 29 falls on Feb 28 in non-leap years.
        `today` is optional (defaults to date.today()); it lets tests pin the day.
        """
        from datetime import date
        today = today or date.today()
        if self.recurrence == "yearly":
            next_occ = _anniversary_in(today.year, self.date)
            if next_occ < today:
                next_occ = _anniversary_in(today.year + 1, self.date)
        else:
            next_occ = self.date
            if next_occ < today:
                return None
        return (next_occ - today).days


# ---------------------------------------------------------------------------
# Organization - institutions (universities, companies, etc.) and memberships.
# ---------------------------------------------------------------------------


def organization_logo_upload_to(instance: "Organization", filename: str) -> str:
    """Stable path: org_logos/org_<id>.<ext>. A single logo per institution."""
    ext = (filename.rsplit(".", 1)[-1] or "png").lower()
    return f"org_logos/org_{instance.pk}.{ext}"


class Organization(models.Model):
    KIND_CHOICES = [
        ("university", "Universidad"),
        ("school", "Colegio"),
        ("company", "Empresa"),
        ("government", "Gobierno"),
        ("health", "Salud"),
        ("community", "Comunidad"),
        ("other", "Otro"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organizations",
    )
    name = models.CharField(max_length=150)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="other")
    logo = models.ImageField(
        upload_to=organization_logo_upload_to,
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["png", "jpg", "jpeg", "webp", "gif"]),
        ],
    )
    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    notes_enc = EncryptedTextField(blank=True, default="")
    created_via = created_via_field()

    tags = models.ManyToManyField(Tag, related_name="organizations", blank=True)

    attachments = GenericRelation(
        Attachment,
        content_type_field="subject_type",
        object_id_field="subject_id",
        related_query_name="organization",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"], name="unique_organization_name_per_owner",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class PersonOrganization(models.Model):
    person = models.ForeignKey(
        Person, on_delete=models.CASCADE, related_name="memberships",
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships",
    )
    role = models.CharField(max_length=120, blank=True, default="")
    is_current = models.BooleanField(default=True)
    start_year = models.PositiveSmallIntegerField(null=True, blank=True)
    end_year = models.PositiveSmallIntegerField(null=True, blank=True)
    created_via = created_via_field()

    class Meta:
        ordering = ("-is_current", "organization__name")
        constraints = [
            models.UniqueConstraint(
                fields=["person", "organization", "role"],
                name="unique_person_organization_role",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.person} @ {self.organization} ({self.role})"


# ---------------------------------------------------------------------------
# Reminder - date + time reminders (Reminder vs ImportantDate).
# ---------------------------------------------------------------------------


RECURRENCE_CHOICES = [
    ("none",    "Sin recurrencia"),
    ("yearly",  "Anual"),
    ("monthly", "Mensual"),
    ("weekly",  "Semanal"),
]


class Reminder(models.Model):
    STATUS_CHOICES = [
        ("todo", "Pendiente"),
        ("in_progress", "En curso"),
        ("done", "Hecho"),
    ]
    KIND_CHOICES = [
        ("task", "Tarea"),
        ("call", "Llamada"),
        ("meeting", "Reunión"),
        ("birthday", "Cumpleaños"),
        ("other", "Otro"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reminders",
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="reminders",
        null=True, blank=True,
        help_text="Opcional — el reminder puede no estar atado a una persona.",
    )
    title = models.CharField(max_length=200)
    remind_at = models.DateTimeField()
    recur = models.CharField(
        max_length=10, choices=RECURRENCE_CHOICES, default="none",
    )
    lead_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Avísame N minutos antes (front convierte días/horas).",
    )
    message_enc = EncryptedTextField(blank=True, default="")
    completed = models.BooleanField(default=False)

    # Board: card state. Kept in sync with `completed`
    # (status == "done" if and only if completed == True), see save().
    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default="todo", db_default="todo", db_index=True,
    )
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="task", db_default="task")
    location = models.CharField(max_length=200, blank=True, default="", db_default="")
    participants = models.ManyToManyField(
        Person, blank=True, related_name="meeting_reminders",
        help_text="Personas extra ademas de `person` (reuniones).",
    )
    created_via = created_via_field()

    # Reminder attachments (image, PDF, event audio, etc.)
    attachments = GenericRelation(
        Attachment,
        content_type_field="subject_type",
        object_id_field="subject_id",
        related_query_name="reminder",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("completed", "remind_at")
        indexes = [
            models.Index(fields=["owner", "completed", "remind_at"]),
            models.Index(fields=["owner", "status", "remind_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} @ {self.remind_at:%Y-%m-%d %H:%M}"

    @classmethod
    def from_db(cls, db, field_names, values):
        # Store the values loaded from the DB to detect which field changed
        # in save(). __dict__.get avoids triggering a load if the field is
        # deferred.
        instance = super().from_db(db, field_names, values)
        instance._loaded_status = instance.__dict__.get("status")
        instance._loaded_completed = instance.__dict__.get("completed")
        return instance

    def refresh_from_db(self, *args, **kwargs):
        super().refresh_from_db(*args, **kwargs)
        self._loaded_status = self.__dict__.get("status")
        self._loaded_completed = self.__dict__.get("completed")

    def save(self, *args, **kwargs):
        """
        Keeps `status` and `completed` in sync (done <=> completed).
        If `status` changed, `status` wins; if `completed` changed, `completed`
        wins; if both changed, `status` prevails. On creation,
        `status == "done"` or `completed=True` leave both in the done state.
        """
        if self._state.adding:
            if self.status == "done":
                self.completed = True
            elif self.completed:
                self.status = "done"
        else:
            loaded_status = getattr(self, "_loaded_status", None)
            loaded_completed = getattr(self, "_loaded_completed", None)
            status_changed = loaded_status is not None and self.status != loaded_status
            completed_changed = (
                loaded_completed is not None and self.completed != loaded_completed
            )
            if status_changed:
                self.completed = self.status == "done"
            elif completed_changed:
                if self.completed:
                    self.status = "done"
                elif self.status == "done":
                    self.status = "todo"
            else:
                # Neither changed: enforce the invariant.
                self.completed = self.status == "done"

        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"status", "completed"}

        super().save(*args, **kwargs)
        self._loaded_status = self.status
        self._loaded_completed = self.completed


# ---------------------------------------------------------------------------
# Interaction - log of contacts/messages/meetings that ALREADY happened.
# ---------------------------------------------------------------------------


class Interaction(models.Model):
    KIND_CHOICES = [
        ("call",             "Llamada"),
        ("message",          "Mensaje"),
        ("email",            "Email"),
        ("meeting_in_person","Encuentro presencial"),
        ("video_call",       "Videollamada"),
        ("gift",             "Regalo"),
        ("note_shared",      "Nota compartida"),
        ("other",            "Otro"),
    ]

    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="interactions",
    )
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    occurred_at = models.DateTimeField()
    channel = models.CharField(max_length=100, blank=True, default="")
    body_enc = EncryptedTextField(blank=True, default="")

    # Manual: the user decides whether this interaction counts as a "contact"
    # for cadence purposes.
    counts_as_contact = models.BooleanField(
        default=False,
        help_text="Si True, alimenta Person.last_contacted_at (signal).",
    )
    created_via = created_via_field()

    # Who created it = implicit owner via person.owner (read-only).

    attachments = GenericRelation(
        Attachment,
        content_type_field="subject_type",
        object_id_field="subject_id",
        related_query_name="interaction",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-occurred_at",)
        indexes = [
            models.Index(fields=["person", "-occurred_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} @ {self.occurred_at:%Y-%m-%d}"


# ---------------------------------------------------------------------------
# Note - encrypted notes tied to a person.
# ---------------------------------------------------------------------------


class Note(models.Model):
    CATEGORY_CHOICES = [
        ("general",    "General"),
        ("followup",   "Pendiente"),
        ("gift_idea",  "Idea regalo"),
        ("important",  "Importante"),
    ]

    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    body_enc = EncryptedTextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="general")
    created_via = created_via_field()

    attachments = GenericRelation(
        Attachment,
        content_type_field="subject_type",
        object_id_field="subject_id",
        related_query_name="note",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["person", "-created_at"]),
        ]

    def __str__(self) -> str:
        preview = (self.body_enc[:40] + "…") if len(self.body_enc) > 40 else self.body_enc
        return f"Note #{self.pk}: {preview}"
