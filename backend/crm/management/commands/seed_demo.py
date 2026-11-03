"""
`seed_demo` command - loads demo data to try out the CRM.

Creates a demo user with 4 tags, 3 fully populated persons (contacts,
important dates, interactions, notes) and 4 reminders. Lets you see all
the UI tabs with content without entering anything by hand.

Usage:
    python manage.py seed_demo
    python manage.py seed_demo --email otro@correo.test --password secreto
    python manage.py seed_demo --reset

Only runs with DEBUG=True. It is idempotent: if the user already exists and
--reset is not passed, nothing is duplicated. It does not create Attachments
(they require encrypted storage).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.models import (
    ContactInfo,
    ImportantDate,
    Interaction,
    Note,
    Person,
    Reminder,
    Tag,
)

DEFAULT_EMAIL = "demo@simplecrm.test"
DEFAULT_PASSWORD = "demo-crm-2026"
DEMO_USERNAME = "demo"


class Command(BaseCommand):
    help = (
        "Loads demo data (user, tags, persons, interactions, notes and "
        "reminders). Only with DEBUG=True."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default=DEFAULT_EMAIL,
            help=f"Demo user email (default: {DEFAULT_EMAIL}).",
        )
        parser.add_argument(
            "--password",
            default=DEFAULT_PASSWORD,
            help=f"Demo user password (default: {DEFAULT_PASSWORD}).",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Deletes the existing user (and all its data) and recreates it.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_demo can only run with DEBUG=True. "
                "It is meant for development, not production."
            )

        email = options["email"].strip().lower()
        password = options["password"]
        reset = options["reset"]

        User = get_user_model()
        existing = User.objects.filter(email__iexact=email).first()

        if existing and not reset:
            self.stdout.write(
                f"User {email} already exists; nothing was created. "
                "Use --reset to delete it and recreate the demo data."
            )
            return

        with transaction.atomic():
            if existing:
                # Deleting the user takes tags, persons and reminders with it (CASCADE).
                existing.delete()

            user = self._create_user(User, email, password)
            tags = self._create_tags(user)
            self._create_people(user, tags)
            self._create_reminders(user)

            counts = {
                "tags": Tag.objects.filter(owner=user).count(),
                "persons": Person.objects.filter(owner=user).count(),
                "contacts": ContactInfo.objects.filter(person__owner=user).count(),
                "important dates": ImportantDate.objects.filter(person__owner=user).count(),
                "interactions": Interaction.objects.filter(person__owner=user).count(),
                "notes": Note.objects.filter(person__owner=user).count(),
                "reminders": Reminder.objects.filter(owner=user).count(),
            }

        self.stdout.write(self.style.SUCCESS("Demo data created."))
        self.stdout.write(f"  Email:    {email}")
        self.stdout.write(f"  Password: {password}")
        for label, n in counts.items():
            self.stdout.write(f"  {label}: {n}")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _create_user(self, User, email: str, password: str):
        # username is in REQUIRED_FIELDS and is unique: avoid collisions.
        username = DEMO_USERNAME
        n = 1
        while User.objects.filter(username=username).exists():
            n += 1
            username = f"{DEMO_USERNAME}{n}"

        user = User(
            email=email,
            username=username,
            first_name="Demo",
            last_name="User",
            # The demo user sees the welcome page (/welcome/) on first login.
            onboarding_completed=False,
        )
        user.set_password(password)
        user.save()
        return user

    def _create_tags(self, user) -> dict[str, Tag]:
        spec = [
            ("Familia", "#e11d48"),
            ("Trabajo", "#2563eb"),
            ("Amigos", "#16a34a"),
            ("Universidad", "#d97706"),
        ]
        return {
            name: Tag.objects.create(owner=user, name=name, color=color)
            for name, color in spec
        }

    def _create_people(self, user, tags: dict[str, Tag]) -> None:
        now = timezone.now()
        today = timezone.localdate()

        def ago(days: int, hour: int = 18) -> datetime:
            """Aware datetime, `days` days ago, at the given local hour."""
            base = timezone.localtime(now) - timedelta(days=days)
            return base.replace(hour=hour, minute=0, second=0, microsecond=0)

        # Birthday in ~6 days.
        soon = today + timedelta(days=6)

        # Expected cadence states (see Person.cadence_status):
        #   María José: cadence 90, last contact 10 days ago -> ok
        #   Matías:     cadence 30, last contact 28 days ago -> due_soon
        #   Camila:     cadence 7,  last contact 20 days ago -> overdue
        people = [
            {
                "person": dict(
                    first_name="María José",
                    last_name="González Pérez",
                    nick_name="Majo",
                    company="Banco del Pacífico",
                    role="Ingeniera de datos",
                    how_we_met_enc=(
                        "Nos conocimos en primer año de ingeniería en la "
                        "Universidad de Chile, en el taller de cálculo."
                    ),
                    favorite=True,
                    cadence_days=90,
                ),
                "tags": ["Amigos", "Universidad"],
                "contacts": [
                    ("whatsapp", "+56 9 8123 4567", "Principal"),
                    ("personal_email", "majo.gonzalez@correo.test", ""),
                    ("instagram", "@majo.gonzalez", ""),
                ],
                "birthday": (date(1992, soon.month, soon.day), 1992),
                "custom_date": None,
                "interactions": [
                    ("video_call", 10, "Google Meet", True,
                     "Videollamada larga para ponernos al día. Está por cambiar de trabajo."),
                    ("message", 35, "WhatsApp", True,
                     "Me mandó fotos de su viaje a Chiloé."),
                    ("meeting_in_person", 58, "Café en Providencia", True,
                     "Almuerzo por su cumpleaños atrasado. Quedamos de repetir."),
                ],
                "notes": [
                    ("gift_idea", "Le gustan los libros de ciencia ficción, en especial Ursula K. Le Guin."),
                    ("important", "Alérgica a los mariscos. Tenerlo presente al elegir restaurante."),
                ],
                "last_contact_days": 10,
            },
            {
                "person": dict(
                    first_name="Matías",
                    last_name="Soto Riquelme",
                    nick_name="Mati",
                    company="Constructora Andes",
                    role="Jefe de proyectos",
                    how_we_met_enc="Compañeros de trabajo en mi primera práctica, en Santiago centro.",
                    favorite=False,
                    cadence_days=30,
                ),
                "tags": ["Trabajo"],
                "contacts": [
                    ("work_email", "m.soto@constructoraandes.test", ""),
                    ("work_phone", "+56 9 7765 4321", "Oficina"),
                    ("linkedin", "linkedin.com/in/matias-soto-riquelme", ""),
                ],
                "birthday": (date(1988, 3, 14), 1988),
                "custom_date": dict(
                    title="Aniversario de matrimonio",
                    description="Cumplen años de casados. Siempre agradece que le escriban.",
                    icon="heart",
                    date=date(2015, 11, 20),
                ),
                "interactions": [
                    ("call", 28, "Teléfono", True,
                     "Me contó del nuevo proyecto en Rancagua. Posible colaboración."),
                    ("email", 40, "Correo", True,
                     "Le envié mi CV actualizado y la propuesta."),
                    ("message", 55, "WhatsApp", True,
                     "Intercambiamos saludos por fiestas patrias."),
                ],
                "notes": [
                    ("followup", "Pendiente: presentarle a mi contacto de la constructora vecina."),
                ],
                "last_contact_days": 28,
            },
            {
                "person": dict(
                    first_name="Camila",
                    last_name="Fernández Araya",
                    nick_name="Cami",
                    company="",
                    role="Estudiante de medicina",
                    how_we_met_enc="Es mi prima. Crecimos juntos en Valparaíso, en la casa de los abuelos.",
                    favorite=False,
                    cadence_days=7,
                ),
                "tags": ["Familia", "Amigos"],
                "contacts": [
                    ("personal_phone", "+56 9 9234 5678", ""),
                    ("telegram", "@cami_fernandez", ""),
                ],
                "birthday": (date(1999, 9, 23), 1999),
                "custom_date": None,
                "interactions": [
                    ("call", 20, "Teléfono", True,
                     "Me contó que rindió el examen de anatomía. Salió contenta."),
                    ("email", 33, "Correo", True,
                     "Me pidió los apuntes de química que le quedaban."),
                    ("gift", 4, "En persona", False,
                     "Le dejé un libro de regalo por su internado."),
                ],
                "notes": [
                    ("general", "Vive en Viña del Mar, cerca de la Universidad de Valparaíso."),
                    ("gift_idea", "Quiere un estetoscopio propio. Pensar en su cumpleaños."),
                ],
                "last_contact_days": 20,
            },
        ]

        for spec in people:
            person = Person.objects.create(owner=user, **spec["person"])
            person.tags.set([tags[name] for name in spec["tags"]])

            for type_, value, label in spec["contacts"]:
                ContactInfo.objects.create(person=person, type=type_, value=value, label=label)

            birth_date, birth_year = spec["birthday"]
            ImportantDate.objects.create(
                person=person,
                kind="birthday",
                birth_year=birth_year,
                title="Cumpleaños",
                icon="cake",
                date=birth_date,
                recurrence="yearly",
            )
            if spec["custom_date"]:
                ImportantDate.objects.create(
                    person=person,
                    kind="custom",
                    recurrence="yearly",
                    **spec["custom_date"],
                )

            for kind, days, channel, counts, body in spec["interactions"]:
                Interaction.objects.create(
                    person=person,
                    kind=kind,
                    occurred_at=ago(days),
                    channel=channel,
                    body_enc=body,
                    counts_as_contact=counts,
                )

            for category, body in spec["notes"]:
                Note.objects.create(person=person, category=category, body_enc=body)

            # The signal already derives last_contacted_at, but we set it explicitly
            # to guarantee the intended cadence state (ok / due_soon / overdue).
            Person.objects.filter(pk=person.pk).update(
                last_contacted_at=ago(spec["last_contact_days"])
            )

    def _create_reminders(self, user) -> None:
        now = timezone.now()
        persons = {p.first_name: p for p in Person.objects.filter(owner=user)}

        def at(days: int, hour: int = 9) -> datetime:
            """Aware datetime, `days` days from today (negative = past), at the local hour."""
            base = timezone.localtime(now) + timedelta(days=days)
            return base.replace(hour=hour, minute=0, second=0, microsecond=0)

        Reminder.objects.create(
            owner=user,
            person=persons["María José"],
            title="Saludar a Majo por su cumpleaños",
            remind_at=at(5, 9),
            recur="yearly",
            lead_minutes=0,
            message_enc="Llamarla temprano. Preguntarle cómo va el cambio de trabajo.",
        )
        Reminder.objects.create(
            owner=user,
            person=persons["Matías"],
            title="Llamar a Matías por el proyecto",
            remind_at=at(2, 11),
            recur="none",
            lead_minutes=60,
            message_enc="Consultar si hay novedades de la colaboración en Rancagua.",
        )
        # Past and completed. recur=none so the signal for completed
        # yearly reminders does not generate an extra Interaction.
        Reminder.objects.create(
            owner=user,
            person=persons["Camila"],
            title="Enviar apuntes de química a Cami",
            remind_at=at(-3, 16),
            recur="none",
            lead_minutes=0,
            message_enc="Mandarle el PDF por correo antes de su examen.",
            completed=True,
        )
        # No associated person.
        Reminder.objects.create(
            owner=user,
            person=None,
            title="Renovar suscripción del dominio",
            remind_at=at(14, 10),
            recur="none",
            lead_minutes=0,
            message_enc="Revisar el medio de pago antes de la fecha de cobro.",
        )
