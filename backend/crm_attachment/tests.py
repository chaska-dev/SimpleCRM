"""Attachment tests: allowed subjects, immutability, real mime, thumbs and file deletion."""

import io
import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from crm.models import Note, Person

from .models import Attachment

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"


def png_bytes(size=(100, 100)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "red").save(buf, format="PNG")
    return buf.getvalue()


class AttachmentTests(APITestCase):
    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.media = media
        self.user = User.objects.create_user(email="a@att.test", username="a", password=PASSWORD)
        self.other = User.objects.create_user(email="b@att.test", username="b", password=PASSWORD)
        self.person = Person.objects.create(owner=self.user, first_name="Ana")
        self.client.force_authenticate(self.user)

    def upload(self, content=b"hola", name="nota.txt", ctype="text/plain",
               subject_type="crm.person", subject_id=None):
        return self.client.post("/api/attachments/", {
            "title": "t",
            "file": SimpleUploadedFile(name, content, content_type=ctype),
            "subject_type": subject_type,
            "subject_id": subject_id or self.person.pk,
        }, format="multipart")

    def test_subject_must_be_allowed_and_owned(self):
        foreign_person = Person.objects.create(owner=self.other, first_name="Otra")
        foreign_note = Note.objects.create(person=foreign_person, body_enc="x")
        res = self.upload(subject_type="crm.note", subject_id=foreign_note.pk)
        self.assertEqual(res.status_code, 400, res.content)
        res = self.upload(subject_type="auth.user", subject_id=self.user.pk)
        self.assertEqual(res.status_code, 400)
        own_note = Note.objects.create(person=self.person, body_enc="x")
        res = self.upload(subject_type="crm.note", subject_id=own_note.pk)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["subject_type"], "crm.note")

    def test_update_only_changes_title_and_description(self):
        att_id = self.upload().json()["id"]
        other_person = Person.objects.create(owner=self.user, first_name="Beto")
        res = self.client.patch(f"/api/attachments/{att_id}/", {
            "title": "nuevo", "subject_id": other_person.pk, "mime_type": "image/png",
            "size_bytes": 1, "file": SimpleUploadedFile("x.txt", b"zzz", content_type="text/plain"),
        }, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        att = Attachment.objects.get(pk=att_id)
        self.assertEqual(
            (att.title, att.subject_id, att.mime_type, att.size_bytes, att.original_filename),
            ("nuevo", self.person.pk, "text/plain", 4, "nota.txt"),
        )

    def test_mime_is_derived_on_server(self):
        res = self.upload(png_bytes(), "foto.png", "image/png")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["mime_type"], "image/png")
        # Declared as an image but it is not -> rejected.
        self.assertEqual(self.upload(b"no soy imagen", "x.png", "image/png").status_code, 400)
        # Real PNG declared as jpeg -> the real mime is stored.
        res = self.upload(png_bytes(), "foto.jpg", "image/jpeg")
        self.assertEqual(res.json()["mime_type"], "image/png")
        # Type outside the whitelist.
        self.assertEqual(self.upload(b"<html>", "a.html", "text/html").status_code, 400)

    def test_thumb_clamps_width_and_handles_bad_images(self):
        first = self.upload(png_bytes((300, 300)), "f.png", "image/png").json()
        res = self.client.get(f"/api/attachments/{first['id']}/thumb/?w=1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Image.open(io.BytesIO(res.content)).width, 16)
        self.assertEqual(
            self.client.get(f"/api/attachments/{first['id']}/thumb/?w=abc").status_code, 200,
        )
        palette = io.BytesIO()
        Image.new("P", (20, 20)).save(palette, format="PNG")
        pal_id = self.upload(palette.getvalue(), "p.png", "image/png").json()["id"]
        self.assertEqual(self.client.get(f"/api/attachments/{pal_id}/thumb/").status_code, 200)
        broken = Attachment.objects.create(
            owner=self.user, title="roto", mime_type="image/png",
            subject_type=Attachment.objects.get(pk=first["id"]).subject_type,
            subject_id=self.person.pk,
        )
        broken.file.save("roto.png", ContentFile(b"basura"), save=True)
        self.assertEqual(self.client.get(f"/api/attachments/{broken.pk}/thumb/").status_code, 415)

    def test_non_numeric_subject_id_filter_is_400(self):
        res = self.client.get("/api/attachments/?subject_type=person&subject_id=abc")
        self.assertEqual(res.status_code, 400)

    def test_file_is_removed_from_disk_when_row_is_deleted(self):
        att = Attachment.objects.get(pk=self.upload().json()["id"])
        path = os.path.join(self.media, "attachments", att.file.name)
        self.assertTrue(os.path.exists(path))
        att.delete()
        self.assertFalse(os.path.exists(path))
        # Also on cascade deletion (person -> attachments).
        att2 = Attachment.objects.get(pk=self.upload().json()["id"])
        path2 = os.path.join(self.media, "attachments", att2.file.name)
        self.person.delete()
        self.assertFalse(os.path.exists(path2))
