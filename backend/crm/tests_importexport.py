"""Tests for importing / exporting contacts (spec v6 K) with real sample files."""

from datetime import date
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from rest_framework.test import APITestCase

from . import importexport
from .models import ContactInfo, ImportantDate, Note, Person, Tag

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "importexport"

PREVIEW_URL = "/api/persons/import/preview/"
IMPORT_URL = "/api/persons/import/"
EXPORT_URL = "/api/persons/export/"


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def upload(name: str, content: bytes | None = None) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content if content is not None else fixture_bytes(name))


class ImportExportTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="a@crm.test", username="a", password=PASSWORD)
        self.other = User.objects.create_user(email="b@crm.test", username="b", password=PASSWORD)
        self.client.force_authenticate(self.user)

    def preview(self, name, content=None):
        return self.client.post(PREVIEW_URL, {"file": upload(name, content)}, format="multipart")

    def do_import(self, name, content=None, **extra):
        data = {"file": upload(name, content), **extra}
        return self.client.post(IMPORT_URL, data, format="multipart")


class ParseFixturesTests(ImportExportTestCase):
    def test_android_vcard21_quoted_printable(self):
        res = self.preview("android_vcard21.vcf")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["format"], "vcard")
        self.assertEqual(body["total"], 4)
        self.assertEqual(body["new"], 3)
        self.assertEqual(body["duplicates"], 0)
        self.assertEqual(len(body["errors"]), 1)  # empty card
        first = body["rows"][0]
        self.assertEqual(first["name"], "José María Muñoz Peña")
        self.assertEqual(first["company"], "Café del Valle")
        self.assertEqual(first["phones"], ["+51 999 111 222", "+51 1 555 0101"])
        self.assertEqual(first["birthday"], "1988-07-21")

        res = self.do_import("android_vcard21.vcf")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["created"], 3)
        jose = Person.objects.get(owner=self.user, first_name="José María")
        self.assertEqual(jose.last_name, "Muñoz Peña")
        self.assertEqual(jose.nick_name, "Pepe")
        self.assertEqual(jose.role, "Jefe de Compras")
        self.assertEqual(jose.created_via, "import")
        phones = {c.value: (c.type, c.label) for c in jose.contacts_info.all()}
        self.assertEqual(phones["+51 999 111 222"], ("personal_phone", "CELL"))
        self.assertEqual(phones["+51 1 555 0101"], ("work_phone", "WORK"))
        self.assertEqual(phones["jmunoz@cafedelvalle.example.test"][0], "work_email")
        self.assertEqual(phones["jose.munoz@example.test"][0], "personal_email")
        self.assertTrue(all(c.created_via == "import" for c in jose.contacts_info.all()))
        birthday = jose.important_dates.get()
        self.assertEqual((birthday.kind, birthday.recurrence, birthday.birth_year), ("birthday", "yearly", 1988))
        self.assertEqual(birthday.date, date(1988, 7, 21))
        note = jose.notes.get()
        # QP line breaks and soft break (`=` at the end) decoded, address added.
        self.assertIn("Lo conocí en la feria de café.\nLe gusta el té verde y las anécdotas largas.", note.body_enc)
        self.assertIn("Dirección: Calle Los Olivos 123, San Isidro, 15036, Perú", note.body_enc)
        with connection.cursor() as cur:
            cur.execute("SELECT body_enc FROM crm_note WHERE id = %s", [note.pk])
            self.assertNotIn("feria", cur.fetchone()[0])  # encrypted in the DB
        # FN only: split at the first space. Instagram by domain.
        carlos = Person.objects.get(owner=self.user, first_name="Carlos")
        self.assertEqual(carlos.last_name, "Quispe Ramos")
        self.assertEqual(carlos.contacts_info.get(type="instagram").value,
                         "https://www.instagram.com/carlos.quispe.test")
        self.assertEqual(carlos.contacts_info.get(type="personal_phone").label, "HOME")

    def test_iphone_vcard30_bday_1604_labels_and_categories(self):
        body = self.preview("iphone_vcard30.vcf").json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["rows"][0]["birthday"], "--03-15")
        self.assertEqual(body["rows"][1]["birthday"], "1991-02-14")
        self.assertEqual(body["rows"][2]["birthday"], "--12-24")

        res = self.do_import("iphone_vcard30.vcf", import_labels="true", tag="Importado hoy")
        self.assertEqual(res.status_code, 200, res.content)
        marta = Person.objects.get(owner=self.user, first_name="Marta Elena")
        self.assertEqual(marta.company, "Panadería La Espiga")
        birthday = marta.important_dates.get()
        self.assertIsNone(birthday.birth_year)  # 1604 = no year
        self.assertEqual((birthday.date.month, birthday.date.day), (3, 15))
        by_type = {c.type: c for c in marta.contacts_info.all()}
        self.assertEqual(by_type["linkedin"].label, "HomePage")  # item2.X-ABLabel
        self.assertEqual(by_type["facebook"].label, "Facebook")
        self.assertEqual(by_type["x"].value, "martaval")  # X-SOCIALPROFILE;type=twitter
        self.assertEqual(by_type["work_phone"].value, "+51 1 555 0199")
        self.assertEqual(by_type["personal_phone"].value, "+51 987 000 111")
        self.assertEqual(
            sorted(t.name for t in marta.tags.all()), ["Familia", "Importado hoy", "Trabajo"],
        )
        self.assertIn("Prefiere pan integral, sin sal.", marta.notes.get().body_enc)
        diego = Person.objects.get(owner=self.user, first_name="Diego")
        self.assertEqual([t.name for t in diego.tags.all()], ["Importado hoy"])

    def test_labels_ignored_unless_requested(self):
        self.do_import("iphone_vcard30.vcf")
        self.assertEqual(Tag.objects.filter(owner=self.user).count(), 0)

    def test_vcard40(self):
        res = self.do_import("vcard40.vcf", import_labels="1")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["created"], 3)
        renata = Person.objects.get(owner=self.user, first_name="Renata")
        self.assertEqual(renata.last_name, "Quiroga Díaz")
        types = {c.value: c.type for c in renata.contacts_info.all()}
        self.assertEqual(types["+54-11-5555-0188"], "personal_phone")  # without "tel:"
        self.assertEqual(types["+54-11-5555-0100"], "work_phone")
        self.assertEqual(types["https://x.com/renataq_test"], "x")
        self.assertEqual(types["https://t.me/renataq_test"], "telegram")
        self.assertEqual(renata.important_dates.get().date, date(1985, 3, 2))
        # --0229 (Feb 29 without year) allowed.
        tomas = Person.objects.get(owner=self.user, first_name="Tomás")
        d = tomas.important_dates.get()
        self.assertEqual((d.date.month, d.date.day, d.birth_year), (2, 29, None))
        ivana = Person.objects.get(owner=self.user, first_name="Ivana")
        self.assertEqual((ivana.important_dates.get().date.month, ivana.important_dates.get().date.day), (6, 30))

    def test_google_csv_new_header(self):
        body = self.preview("google_contacts_new.csv").json()
        self.assertEqual(body["format"], "google_csv")
        self.assertEqual(body["total"], 4)  # the empty row does not count
        res = self.do_import("google_contacts_new.csv", import_labels="true")
        self.assertEqual(res.status_code, 200, res.content)
        andrea = Person.objects.get(owner=self.user, first_name="Andrea")
        self.assertTrue(andrea.favorite)  # * starred
        self.assertEqual([t.name for t in andrea.tags.all()], ["Amigos"])  # without "* myContacts"
        self.assertEqual(andrea.nick_name, "Andre")
        self.assertEqual(andrea.company, "Taller Lozano")
        self.assertEqual(andrea.role, "Contadora")
        by_value = {c.value: c for c in andrea.contacts_info.all()}
        self.assertEqual(by_value["+51 1 555 0123"].type, "work_phone")
        self.assertEqual(by_value["+51 944 123 456"].label, "Mobile")
        self.assertEqual(by_value["alozano@taller.example.test"].type, "work_email")
        self.assertEqual(by_value["https://www.instagram.com/andrea.lozano.test"].type, "instagram")
        self.assertEqual(andrea.important_dates.get().date, date(1992, 11, 8))
        note = andrea.notes.get().body_enc
        self.assertIn("Prefiere que la llamen por la tarde.\nTiene dos gatos.", note)
        self.assertIn("Dirección: Jr. de la Unión 100, Lima", note)
        bruno = Person.objects.get(owner=self.user, first_name="Bruno")
        self.assertIsNone(bruno.important_dates.get().birth_year)
        camila = Person.objects.get(owner=self.user, first_name="Camila")
        self.assertEqual(camila.company, "Librería Sol")

    def test_google_csv_old_header(self):
        body = self.preview("google_contacts_old.csv").json()
        self.assertEqual(body["format"], "google_csv")
        self.assertEqual(body["total"], 2)
        res = self.do_import("google_contacts_old.csv", import_labels="true")
        self.assertEqual(res.status_code, 200, res.content)
        gabriela = Person.objects.get(owner=self.user, first_name="Gabriela")
        self.assertEqual(gabriela.last_name, "Paredes")
        self.assertEqual(gabriela.nick_name, "Gabi")
        self.assertEqual(sorted(t.name for t in gabriela.tags.all()), ["Amigos", "Yoga"])
        emails = sorted(c.value for c in gabriela.contacts_info.filter(type="personal_email"))
        self.assertEqual(emails, ["gabriela.paredes@example.test", "gparedes@estudio.example.test"])
        self.assertEqual(gabriela.contacts_info.get(type="work_phone").value, "+51 1 555 0144")
        self.assertEqual(gabriela.contacts_info.get(type="linkedin").label, "Profile")
        hector = Person.objects.get(owner=self.user, first_name="Héctor")
        self.assertEqual(hector.contacts_info.get(type="work_email").value, "hmejia@example.test")
        self.assertFalse(hector.favorite)

    def test_format_detected_by_content_not_extension(self):
        res = self.preview("contactos.txt", fixture_bytes("vcard40.vcf"))
        self.assertEqual(res.json()["format"], "vcard")
        res = self.preview("contactos.vcf", fixture_bytes("google_contacts_new.csv"))
        self.assertEqual(res.json()["format"], "google_csv")

    def test_preview_does_not_write(self):
        self.preview("android_vcard21.vcf")
        self.assertEqual(Person.objects.count(), 0)
        self.assertEqual(Tag.objects.count(), 0)

    def test_preview_rows_capped_at_50(self):
        cards = "".join(
            f"BEGIN:VCARD\nVERSION:3.0\nFN:Persona{i} Prueba\nEND:VCARD\n" for i in range(60)
        )
        body = self.preview("muchos.vcf", cards.encode()).json()
        self.assertEqual(body["total"], 60)
        self.assertEqual(len(body["rows"]), 50)


class LimitsTests(ImportExportTestCase):
    def test_missing_file_and_unknown_format(self):
        self.assertEqual(self.client.post(PREVIEW_URL, {}, format="multipart").status_code, 400)
        res = self.preview("notas.txt", b"esto no es un contacto")
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.json())
        self.assertEqual(self.preview("vacio.vcf", b"").status_code, 400)

    def test_size_limit(self):
        big = b"BEGIN:VCARD\nVERSION:3.0\nFN:X Y\nEND:VCARD\n" + b" " * importexport.MAX_IMPORT_BYTES
        res = self.preview("grande.vcf", big)
        self.assertEqual(res.status_code, 400)
        self.assertIn("5 MB", str(res.json()))
        self.assertEqual(self.do_import("grande.vcf", big).status_code, 400)

    def test_contact_count_limit(self):
        cards = "BEGIN:VCARD\nFN:A B\nEND:VCARD\n" * (importexport.MAX_IMPORT_CONTACTS + 1)
        res = self.preview("miles.vcf", cards.encode())
        self.assertEqual(res.status_code, 400)
        self.assertIn("5000", str(res.json()))
        header = "First Name,Last Name\n"
        rows = "".join(f"N{i},P\n" for i in range(importexport.MAX_IMPORT_CONTACTS + 1))
        res = self.preview("miles.csv", (header + rows).encode())
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Person.objects.count(), 0)

    def test_invalid_options(self):
        res = self.do_import("vcard40.vcf", duplicates="borrar")
        self.assertEqual(res.status_code, 400)
        self.assertIn("duplicates", res.json())
        self.assertEqual(Person.objects.count(), 0)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertIn(self.preview("vcard40.vcf").status_code, (401, 403))
        self.assertIn(self.client.get(EXPORT_URL).status_code, (401, 403))


class DuplicateTests(ImportExportTestCase):
    def test_detection_by_phone_email_and_accent_insensitive_name(self):
        by_phone = Person.objects.create(owner=self.user, first_name="Otro")
        ContactInfo.objects.create(person=by_phone, type="personal_phone", value="0051944123456")
        by_email = Person.objects.create(owner=self.user, first_name="Mail")
        ContactInfo.objects.create(person=by_email, type="work_email", value="HMEJIA@Example.test")
        by_name = Person.objects.create(owner=self.user, first_name="LUCIA", last_name="ibanez")
        body = self.preview("google_contacts_new.csv").json()
        dups = {r["name"]: r["duplicate_of"] for r in body["rows"] if r["duplicate_of"]}
        self.assertEqual(dups["Édgar Núñez"]["id"], by_phone.pk)  # last 9 digits
        self.assertEqual(body["duplicates"], 2)  # Andrea and Edgar share a phone
        self.assertEqual(dups["Andrea Lozano Vega"]["id"], by_phone.pk)
        body = self.preview("google_contacts_old.csv").json()
        self.assertIsNone(body["rows"][0]["duplicate_of"])
        self.assertEqual(body["rows"][1]["duplicate_of"]["id"], by_email.pk)
        body = self.preview("android_vcard21.vcf").json()
        self.assertEqual(
            [r["duplicate_of"]["id"] if r["duplicate_of"] else None for r in body["rows"]],
            [None, by_name.pk, None],
        )

    def test_skip_merge_create(self):
        existing = Person.objects.create(owner=self.user, first_name="Lucía", last_name="Ibáñez")
        # skip (default)
        res = self.do_import("android_vcard21.vcf").json()
        self.assertEqual((res["created"], res["merged"], res["skipped"]), (2, 0, 1))
        self.assertEqual(existing.contacts_info.count(), 0)
        self.assertEqual(Person.objects.filter(first_name__startswith="Luc").count(), 1)
        # create: creates another identical one
        res = self.do_import("android_vcard21.vcf", duplicates="create").json()
        self.assertEqual((res["created"], res["merged"], res["skipped"]), (3, 0, 0))
        self.assertEqual(Person.objects.filter(first_name__startswith="Luc").count(), 2)

    def test_merge_adds_missing_and_never_overwrites(self):
        existing = Person.objects.create(
            owner=self.user, first_name="Gabriela", last_name="Paredes", company="Mi Empresa",
        )
        ContactInfo.objects.create(person=existing, type="personal_phone", value="955777888")
        ImportantDate.objects.create(
            person=existing, kind="birthday", title="Cumpleaños", date=date(2000, 5, 5),
            birth_year=None,
        )
        Note.objects.create(person=existing, body_enc="Nota previa")
        res = self.do_import("google_contacts_old.csv", duplicates="merge", tag="Mezcla").json()
        self.assertEqual((res["created"], res["merged"], res["skipped"]), (1, 1, 0))
        existing.refresh_from_db()
        self.assertEqual(existing.company, "Mi Empresa")  # not overwritten
        self.assertEqual(existing.nick_name, "Gabi")  # empty field: gets filled in
        self.assertEqual(existing.role, "Diseñadora")
        # The phone was already there (another format): not duplicated; the others are added.
        phones = list(existing.contacts_info.filter(type__in=["personal_phone", "work_phone"]))
        self.assertEqual(sorted(c.value for c in phones), ["+51 1 555 0144", "955777888"])
        self.assertEqual(existing.contacts_info.filter(type="personal_email").count(), 2)
        # Already had a birthday: kept intact.
        self.assertEqual(existing.important_dates.count(), 1)
        self.assertEqual(existing.important_dates.get().date, date(2000, 5, 5))
        bodies = sorted(n.body_enc for n in existing.notes.all())
        self.assertEqual(len(bodies), 2)
        self.assertIn("Nota previa", bodies)
        self.assertEqual([t.name for t in existing.tags.all()], ["Mezcla"])
        # Repeating the merge duplicates nothing.
        self.do_import("google_contacts_old.csv", duplicates="merge")
        self.assertEqual(existing.notes.count(), 2)
        self.assertEqual(existing.contacts_info.count(), 5)

    def test_in_file_duplicates_do_not_hide_each_other(self):
        card = "BEGIN:VCARD\nVERSION:3.0\nFN:Sara Gil\nEND:VCARD\n" * 2
        res = self.do_import("dos.vcf", card.encode()).json()
        self.assertEqual(res["created"], 2)

    def test_row_errors_are_isolated_and_reported(self):
        # The 2nd contact has no name; the others are imported.
        text = "First Name,Last Name,Phone 1 - Value\nAna,Mora,111 222 333\n,,555 666 777\nLuz,Paz,\n"
        res = self.do_import("mezcla.csv", text.encode()).json()
        self.assertEqual(res["created"], 2)
        self.assertEqual([e["row"] for e in res["errors"]], [2])


class OwnerScopingTests(ImportExportTestCase):
    def test_import_only_touches_own_data(self):
        theirs = Person.objects.create(owner=self.other, first_name="Gabriela", last_name="Paredes")
        ContactInfo.objects.create(person=theirs, type="personal_phone", value="+51 955 777 888")
        Tag.objects.create(owner=self.other, name="Amigos")
        body = self.preview("google_contacts_old.csv").json()
        self.assertEqual(body["duplicates"], 0)  # does not see other users' persons
        res = self.do_import("google_contacts_old.csv", duplicates="merge", tag="Amigos", import_labels="true")
        self.assertEqual(res.json()["created"], 2)
        self.assertEqual(Person.objects.filter(owner=self.user).count(), 2)
        self.assertEqual(theirs.contacts_info.count(), 1)
        self.assertEqual(theirs.tags.count(), 0)
        self.assertEqual(Tag.objects.filter(owner=self.user, name="Amigos").count(), 1)
        self.assertEqual(Tag.objects.filter(owner=self.other).count(), 1)

    def test_export_only_own_persons_and_tags(self):
        Person.objects.create(owner=self.other, first_name="Secreto", last_name="Ajeno")
        mine = Person.objects.create(owner=self.user, first_name="Propio")
        res = self.client.get(EXPORT_URL, {"format": "vcf"})
        text = res.content.decode()
        self.assertIn("FN:Propio", text)
        self.assertNotIn("Secreto", text)
        foreign_tag = Tag.objects.create(owner=self.other, name="Ajena")
        res = self.client.get(EXPORT_URL, {"format": "vcf", "tag": foreign_tag.pk})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get(f"/api/persons/{mine.pk}/vcard/").status_code, 200)
        theirs = Person.objects.get(first_name="Secreto")
        self.assertEqual(self.client.get(f"/api/persons/{theirs.pk}/vcard/").status_code, 404)


class ExportTests(ImportExportTestCase):
    def make_person(self):
        person = Person.objects.create(
            owner=self.user, first_name="José María", last_name="Muñoz, Peña", nick_name="Pepe",
            company="Café; del Valle", role="Jefe",
        )
        ContactInfo.objects.create(person=person, type="personal_phone", value="+51 999 111 222")
        ContactInfo.objects.create(person=person, type="work_phone", value="+51 1 555 0101")
        ContactInfo.objects.create(person=person, type="personal_email", value="jose@example.test")
        ContactInfo.objects.create(person=person, type="work_email", value="jmunoz@work.example.test")
        ContactInfo.objects.create(
            person=person, type="instagram", value="https://www.instagram.com/pepe.test",
        )
        ImportantDate.objects.create(
            person=person, kind="birthday", title="Cumpleaños", date=date(1988, 7, 21), birth_year=1988,
        )
        tag = Tag.objects.create(owner=self.user, name="Amigos")
        person.tags.add(tag)
        Note.objects.create(person=person, body_enc="Línea uno\nLínea dos; con, signos")
        return person, tag

    def test_vcf_format_headers_and_folding(self):
        person, tag = self.make_person()
        long_note = "x" * 200 + " ñandú " * 30
        Note.objects.create(person=person, body_enc=long_note)
        Person.objects.create(owner=self.user, first_name="Sin Etiqueta")
        res = self.client.get(EXPORT_URL, {"format": "vcf", "include_notes": "1"})
        self.assertEqual(res.status_code, 200)
        self.assertRegex(
            res["Content-Disposition"],
            r'^attachment; filename="simple-crm-contacts-\d{4}-\d{2}-\d{2}\.vcf"$',
        )
        self.assertIn("text/vcard", res["Content-Type"])
        raw = res.content
        text = raw.decode("utf-8")
        self.assertIn("VERSION:3.0", text)
        self.assertIn("N:Muñoz\\, Peña;José María;;;", text)
        self.assertIn("ORG:Café\\; del Valle", text)
        self.assertIn("TEL;TYPE=CELL:+51 999 111 222", text)
        self.assertIn("TEL;TYPE=WORK:+51 1 555 0101", text)
        self.assertIn("EMAIL;TYPE=HOME:jose@example.test", text)
        self.assertIn("EMAIL;TYPE=WORK:jmunoz@work.example.test", text)
        self.assertIn("URL:https://www.instagram.com/pepe.test", text)
        self.assertIn("BDAY:1988-07-21", text)
        self.assertIn("CATEGORIES:Amigos", text)
        self.assertNotIn("\n", text.replace("\r\n", ""))  # CRLF only
        for line in raw.split(b"\r\n"):
            self.assertLessEqual(len(line), 75)  # octets, includes the continuation space
        # With include_notes=0 there is no NOTE.
        plain = self.client.get(EXPORT_URL, {"format": "vcf"}).content.decode()
        self.assertNotIn("NOTE", plain)
        self.assertNotIn("Línea uno", plain)
        # No year: --MMDD
        ImportantDate.objects.create(
            person=Person.objects.get(first_name="Sin Etiqueta"), kind="birthday",
            title="Cumpleaños", date=date(2000, 2, 29), birth_year=None,
        )
        self.assertIn("BDAY:--0229", self.client.get(EXPORT_URL).content.decode())

    def test_tag_filter(self):
        person, tag = self.make_person()
        Person.objects.create(owner=self.user, first_name="Fuera")
        text = self.client.get(EXPORT_URL, {"format": "vcf", "tag": tag.pk}).content.decode()
        self.assertIn("José María", text)
        self.assertNotIn("Fuera", text)
        self.assertEqual(self.client.get(EXPORT_URL, {"tag": "abc"}).status_code, 400)
        self.assertEqual(self.client.get(EXPORT_URL, {"format": "pdf"}).status_code, 400)

    def test_google_csv_columns(self):
        person, tag = self.make_person()
        person.favorite = True
        person.save()
        res = self.client.get(EXPORT_URL, {"format": "google_csv", "include_notes": "1"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res["Content-Type"])
        self.assertTrue(res["Content-Disposition"].endswith('.csv"'))
        text = res.content.decode("utf-8")
        header = text.split("\r\n")[0]
        for col in ("First Name", "Last Name", "Nickname", "Organization Name", "Birthday",
                    "Notes", "Labels", "E-mail 1 - Value", "Phone 2 - Value", "Website 1 - Value"):
            self.assertIn(col, header)
        self.assertIn("* myContacts ::: * starred ::: Amigos", text)
        no_notes = self.client.get(EXPORT_URL, {"format": "google_csv"}).content.decode()
        self.assertNotIn("Línea uno", no_notes)

    def test_single_person_vcard(self):
        person, _ = self.make_person()
        res = self.client.get(f"/api/persons/{person.pk}/vcard/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Disposition"], 'attachment; filename="jose-maria-munoz-pena.vcf"')
        text = res.content.decode()
        self.assertEqual(text.count("BEGIN:VCARD"), 1)
        self.assertIn("VERSION:3.0", text)
        self.assertNotIn("NOTE", text)  # notes only if requested

    def round_trip(self, fmt):
        person, tag = self.make_person()
        res = self.client.get(EXPORT_URL, {"format": fmt, "include_notes": "1"})
        self.assertEqual(res.status_code, 200)
        self.client.force_authenticate(self.other)
        name = "ida.vcf" if fmt == "vcf" else "ida.csv"
        res = self.do_import(name, res.content, import_labels="true")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["created"], 1)
        copy = Person.objects.get(owner=self.other)
        self.assertEqual(
            (copy.first_name, copy.last_name, copy.nick_name, copy.company, copy.role),
            (person.first_name, person.last_name, person.nick_name, person.company, person.role),
        )
        mine = sorted((c.type, c.value) for c in person.contacts_info.all())
        theirs = sorted((c.type, c.value) for c in copy.contacts_info.all())
        self.assertEqual(theirs, mine)
        bday = copy.important_dates.get()
        self.assertEqual((bday.date, bday.birth_year), (date(1988, 7, 21), 1988))
        self.assertEqual([t.name for t in copy.tags.all()], ["Amigos"])
        self.assertEqual(copy.notes.get().body_enc, "Línea uno\nLínea dos; con, signos")
        self.assertEqual(copy.created_via, "import")

    def test_round_trip_vcard(self):
        self.round_trip("vcf")

    def test_round_trip_google_csv(self):
        self.round_trip("google_csv")

    def test_round_trip_birthday_without_year_and_no_notes(self):
        person = Person.objects.create(owner=self.user, first_name="Sin", last_name="Anio")
        ImportantDate.objects.create(
            person=person, kind="birthday", title="Cumpleaños", date=date(2000, 2, 29),
        )
        Note.objects.create(person=person, body_enc="privada")
        for fmt in ("vcf", "google_csv"):
            content = self.client.get(EXPORT_URL, {"format": fmt}).content
            self.assertNotIn(b"privada", content)
            Person.objects.filter(owner=self.other).delete()
            self.client.force_authenticate(self.other)
            self.do_import("x.vcf" if fmt == "vcf" else "x.csv", content)
            copy = Person.objects.get(owner=self.other)
            d = copy.important_dates.get()
            self.assertEqual((d.date.month, d.date.day, d.birth_year), (2, 29, None))
            self.assertEqual(copy.notes.count(), 0)
            self.client.force_authenticate(self.user)


class UnitTests(APITestCase):
    def test_parse_birthday_formats(self):
        parse = importexport.parse_birthday
        self.assertEqual(parse("1990-05-17"), (5, 17, 1990))
        self.assertEqual(parse("19900517"), (5, 17, 1990))
        self.assertEqual(parse("--0517"), (5, 17, None))
        self.assertEqual(parse("--05-17"), (5, 17, None))
        self.assertEqual(parse("1604-03-15"), (3, 15, None))
        self.assertEqual(parse("--0229"), (2, 29, None))
        self.assertEqual(parse("1992-02-29"), (2, 29, 1992))
        self.assertEqual(parse("1991-02-29"), (2, 29, None))  # non-leap year: the year is discarded
        self.assertIsNone(parse("--0230"))
        self.assertIsNone(parse("no es fecha"))

    def test_phone_and_name_keys(self):
        self.assertEqual(importexport.phone_key("+51 (944) 123-456"), "944123456")
        self.assertEqual(importexport.phone_key("0051944123456"), "944123456")
        self.assertEqual(importexport.phone_key("123"), "")
        self.assertEqual(importexport.name_key("ÁNGEL", " Núñez "), "angel nunez")

    def test_fold_line_never_splits_characters(self):
        folded = importexport.fold_line("NOTE:" + "ñ" * 100)
        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 75)
            part.encode("utf-8").decode("utf-8")
        self.assertEqual(folded.replace("\r\n ", ""), "NOTE:" + "ñ" * 100)
