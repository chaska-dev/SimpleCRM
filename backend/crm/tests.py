"""CRM regression tests: tags, ownership, signals, admin, validations and encryption."""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.utils import timezone
from rest_framework.test import APITestCase

from crm_attachment.models import Attachment

from .fields import UndecryptableValue
from .models import Interaction, Note, Person, Reminder, Tag

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"


class CrmApiTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="a@crm.test", username="a", password=PASSWORD)
        self.other = User.objects.create_user(email="b@crm.test", username="b", password=PASSWORD)
        self.client.force_authenticate(self.user)
        self.person = Person.objects.create(owner=self.user, first_name="Ana")


class TagTests(CrmApiTestCase):
    def test_create_sets_owner_and_rejects_duplicates_case_insensitive(self):
        res = self.client.post("/api/tags/", {"name": "Amigos", "color": "#16a34a"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Tag.objects.get().owner, self.user)
        dup = self.client.post("/api/tags/", {"name": "amigos"}, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertIn("name", dup.json())
        # Another user can reuse the name; renaming does not clash with itself.
        Tag.objects.create(owner=self.other, name="Familia")
        tag_id = res.json()["id"]
        ok = self.client.patch(f"/api/tags/{tag_id}/", {"name": "AMIGOS"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)

    def test_list_includes_person_count(self):
        tag = Tag.objects.create(owner=self.user, name="Amigos")
        Tag.objects.create(owner=self.user, name="Vacia")
        second = Person.objects.create(owner=self.user, first_name="Beto")
        self.person.tags.add(tag)
        second.tags.add(tag)
        counts = {t["name"]: t["person_count"] for t in self.client.get("/api/tags/").json()}
        self.assertEqual(counts, {"Amigos": 2, "Vacia": 0})
        created = self.client.post("/api/tags/", {"name": "Nueva"}, format="json")
        self.assertEqual(created.json()["person_count"], 0)

    def test_person_rejects_other_users_tag(self):
        foreign = Tag.objects.create(owner=self.other, name="Ajena")
        res = self.client.patch(
            f"/api/persons/{self.person.pk}/", {"tag_ids": [foreign.pk]}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("tag_ids", res.json())
        mine = Tag.objects.create(owner=self.user, name="Mia")
        res = self.client.patch(
            f"/api/persons/{self.person.pk}/", {"tag_ids": [mine.pk]}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)


class ImportantDateTests(CrmApiTestCase):
    def test_attachment_must_belong_to_user(self):
        ct = ContentType.objects.get_for_model(Person)
        foreign = Attachment.objects.create(
            owner=self.other, title="x", file="x/y.txt", subject_type=ct, subject_id=1,
        )
        res = self.client.post(
            f"/api/persons/{self.person.pk}/important-dates/",
            {"title": "Boda", "date": "2020-05-01", "attachment": foreign.pk}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("attachment", res.json())


class ReminderSignalTests(CrmApiTestCase):
    def test_interaction_only_on_transition_to_completed(self):
        reminder = Reminder.objects.create(
            owner=self.user, person=self.person, title="Llamar", recur="yearly",
            remind_at=timezone.now(),
        )
        self.assertEqual(Interaction.objects.count(), 0)
        reminder.completed = True
        reminder.save()
        self.assertEqual(Interaction.objects.filter(person=self.person).count(), 1)
        reminder.title = "Llamar de nuevo"
        reminder.save()
        reloaded = Reminder.objects.get(pk=reminder.pk)
        reloaded.save()
        self.assertEqual(Interaction.objects.filter(person=self.person).count(), 1)


class AdminTests(CrmApiTestCase):
    def test_person_admin_pages_render(self):
        admin_user = User.objects.create_superuser(
            email="root@crm.test", username="root", password=PASSWORD,
        )
        Note.objects.create(person=self.person, body_enc="secreto")
        self.client.force_authenticate(None)
        self.client.force_login(admin_user)
        self.assertEqual(self.client.get("/admin/crm/person/add/").status_code, 200)
        res = self.client.get(f"/admin/crm/person/{self.person.pk}/change/")
        self.assertEqual(res.status_code, 200)


class MarkContactedTests(CrmApiTestCase):
    URL = "/api/persons/{}/mark-contacted/"

    def test_valid_and_invalid_payloads(self):
        url = self.URL.format(self.person.pk)
        res = self.client.post(url, {"body": "hola", "channel": "wsp"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["kind"], "call")
        self.person.refresh_from_db()
        self.assertIsNotNone(self.person.last_contacted_at)
        for body in (
            {"occurred_at": "no-es-fecha"},
            {"kind": "inexistente"},
            {"channel": "x" * 101},
            {"body": 123},
            ["no", "es", "objeto"],
        ):
            res = self.client.post(url, body, format="json")
            self.assertEqual(res.status_code, 400, body)


class QueryParamTests(CrmApiTestCase):
    def test_non_numeric_params_do_not_crash(self):
        for url in (
            "/api/persons/?tag=abc",
            "/api/organizations/?tag=abc",
            "/api/reminders/?person_id=abc",
        ):
            self.assertEqual(self.client.get(url).status_code, 400, url)
        res = self.client.get(f"/api/persons/{self.person.pk}/important-dates/upcoming/?days=abc")
        self.assertEqual(res.status_code, 200)


class CadenceTests(CrmApiTestCase):
    def test_cadence_days_has_upper_bound(self):
        res = self.client.patch(
            f"/api/persons/{self.person.pk}/", {"cadence_days": 99999}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(
            f"/api/persons/{self.person.pk}/", {"cadence_days": 3650}, format="json",
        )
        self.assertEqual(res.status_code, 200, res.content)


class UndecryptableValueTests(CrmApiTestCase):
    def _raw(self, pk):
        with connection.cursor() as cur:
            cur.execute("SELECT body_enc FROM crm_note WHERE id = %s", [pk])
            return cur.fetchone()[0]

    def test_corrupt_ciphertext_is_kept_on_save(self):
        note = Note.objects.create(person=self.person, body_enc="texto")
        with connection.cursor() as cur:
            cur.execute("UPDATE crm_note SET body_enc = %s WHERE id = %s", ["no-es-un-token", note.pk])
        loaded = Note.objects.get(pk=note.pk)
        self.assertIsInstance(loaded.body_enc, UndecryptableValue)
        self.assertEqual(loaded.body_enc, "no-es-un-token")
        loaded.category = "important"
        loaded.save()
        self.assertEqual(self._raw(note.pk), "no-es-un-token")
        self.assertEqual(Note.objects.get(pk=note.pk).category, "important")
