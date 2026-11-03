"""Tests for GET /api/dashboard/: pending items, upcoming dates and suggestions (spec v5 H2)."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import ImportantDate, Interaction, Person, Reminder

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"
DAY = timedelta(days=1)


class DashboardTests(APITestCase):
    def setUp(self):
        self.now = timezone.now()
        self.user = User.objects.create_user(email="a@dash.test", username="a", password=PASSWORD)
        self.other = User.objects.create_user(email="b@dash.test", username="b", password=PASSWORD)
        self.client.force_authenticate(self.user)

    def person(self, owner=None, name="P", **kw):
        return Person.objects.create(owner=owner or self.user, first_name=name, **kw)

    def suggestions(self):
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.status_code, 200)
        return [(s["person"]["first_name"], s["reason"], s["days"]) for s in res.json()["suggestions"]]

    def test_legacy_fields_removed(self):
        data = self.client.get("/api/dashboard/").json()
        for key in ("overdue", "due_soon", "never_contacted", "upcoming_reminders"):
            self.assertNotIn(key, data)
        self.assertEqual(data["suggestions"], [])
        self.assertEqual(data["pending_reminders"], [])
        self.assertEqual(data["pending_reminders_total"], 0)

    def test_pending_reminders_overdue_first_max_8_owner_scoped(self):
        for offset in (-5, -2, 1, 2, 3, 4, 5, 6, 7):
            Reminder.objects.create(owner=self.user, title=f"R{offset}", remind_at=self.now + offset * DAY)
        Reminder.objects.create(
            owner=self.user, title="Hecho", remind_at=self.now - 9 * DAY, status="done", completed=True,
        )
        Reminder.objects.create(owner=self.user, title="EnCurso", remind_at=self.now - 3 * DAY, status="in_progress")
        Reminder.objects.create(owner=self.other, title="Ajeno", remind_at=self.now - 9 * DAY)
        data = self.client.get("/api/dashboard/").json()
        titles = [r["title"] for r in data["pending_reminders"]]
        self.assertEqual(titles, ["R-5", "EnCurso", "R-2", "R1", "R2", "R3", "R4", "R5"])
        self.assertEqual(data["pending_reminders_total"], 10)

    def test_upcoming_dates_30_days_with_person_name(self):
        p = self.person(name="Cumple", last_name="Ana")
        today = date.today()
        ImportantDate.objects.create(
            person=p, kind="birthday", title="Cumpleaños", birth_year=1990,
            date=(today + 5 * DAY).replace(year=1992), recurrence="yearly",
        )
        ImportantDate.objects.create(person=p, kind="custom", title="Lejana", date=today + 45 * DAY, recurrence="none")
        foreign = self.person(owner=self.other, name="Ajena")
        ImportantDate.objects.create(person=foreign, kind="custom", title="Ajena", date=today + 2 * DAY, recurrence="none")
        data = self.client.get("/api/dashboard/").json()
        upcoming = data["upcoming_important_dates"]
        self.assertEqual([d["title"] for d in upcoming], ["Cumpleaños"])
        self.assertEqual(upcoming[0]["person_name"], "Cumple Ana")
        self.assertEqual(upcoming[0]["days_until_next"], 5)
        self.assertEqual({d["title"] for d in data["calendar"]}, {"Cumpleaños", "Lejana"})

    def test_suggestions_priority_reasons_and_days(self):
        now = self.now
        self.person(name="Fav", favorite=True, cadence_days=7, last_contacted_at=now - 30 * DAY)
        self.person(name="VencidaVieja", cadence_days=7, last_contacted_at=now - 40 * DAY - timedelta(hours=1))
        self.person(name="VencidaNueva", cadence_days=7, last_contacted_at=now - 9 * DAY - timedelta(hours=1))
        self.person(name="PorVencer", cadence_days=10, last_contacted_at=now - 8 * DAY + timedelta(hours=1))
        self.person(name="AlDia", cadence_days=30, last_contacted_at=now - 2 * DAY)
        seguido = self.person(name="Seguido", cadence_days=100, last_contacted_at=now - 3 * DAY)
        for i in range(3):
            Interaction.objects.create(
                person=seguido, kind="call", occurred_at=now - 3 * DAY - i * timedelta(hours=1),
                counts_as_contact=True,
            )
        viejo = self.person(name="ViejoContacto")
        for i in range(3):  # outside the 90-day window
            Interaction.objects.create(
                person=viejo, kind="call", occurred_at=now - 120 * DAY - i * timedelta(hours=1),
                counts_as_contact=True,
            )
        self.person(name="NuncaContactada", cadence_days=14)
        self.person(name="SinCadencia")
        self.person(owner=self.other, name="AjenaVencida", cadence_days=7, last_contacted_at=now - 50 * DAY)

        self.assertEqual(
            self.suggestions(),
            [
                ("VencidaVieja", "overdue", 33),
                ("VencidaNueva", "overdue", 2),
                ("PorVencer", "due_soon", 2),
                ("Seguido", "frequent", 3),
                ("NuncaContactada", "never_contacted", None),
            ],
        )

    def test_suggestions_skip_people_in_upcoming_dates_and_cap_at_6(self):
        now = self.now
        cumple = self.person(name="Cumple", cadence_days=7, last_contacted_at=now - 30 * DAY)
        ImportantDate.objects.create(
            person=cumple, kind="birthday", title="Cumpleaños", birth_year=1990,
            date=(date.today() + 3 * DAY).replace(year=1992), recurrence="yearly",
        )
        for i in range(8):
            self.person(name=f"V{i}", cadence_days=7, last_contacted_at=now - (20 + i) * DAY)
        names = [n for n, _, _ in self.suggestions()]
        self.assertEqual(len(names), 6)
        self.assertNotIn("Cumple", names)
        self.assertEqual(names[0], "V7")  # the most overdue first

    def test_owner_scoping(self):
        self.person(owner=self.other, name="Ajena", cadence_days=7, last_contacted_at=self.now - 50 * DAY)
        Reminder.objects.create(owner=self.other, title="Ajeno", remind_at=self.now - DAY)
        data = self.client.get("/api/dashboard/").json()
        self.assertEqual(data["suggestions"], [])
        self.assertEqual(data["pending_reminders"], [])


class ImportantDateLeapDayTests(APITestCase):
    """Yearly Feb 29: falls on Feb 28 in non-leap years, without ValueError."""

    def setUp(self):
        self.user = User.objects.create_user(email="leap@dash.test", username="leap", password=PASSWORD)
        self.client.force_authenticate(self.user)
        self.person = Person.objects.create(owner=self.user, first_name="Bisiesta")
        self.leap = ImportantDate.objects.create(
            person=self.person, kind="custom", title="29 feb", date=date(2000, 2, 29), recurrence="yearly",
        )

    def test_non_leap_year_falls_on_feb_28(self):
        self.assertEqual(self.leap.days_until_next(today=date(2027, 2, 1)), 27)

    def test_leap_year_uses_feb_29(self):
        self.assertEqual(self.leap.days_until_next(today=date(2028, 2, 1)), 28)

    def test_after_feb_28_rolls_to_next_leap_day(self):
        self.assertEqual(self.leap.days_until_next(today=date(2027, 3, 1)), 365)

    def test_dashboard_does_not_fail_with_feb_29_date(self):
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.status_code, 200)
