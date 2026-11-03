"""Tests for process_upload and its use in avatar, brand icon, logo and person photo (spec v7 O)."""

import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from crm.models import Organization, Person
from crm_attachment.models import Attachment
from crm_backend.images import MAX_FRAMES, process_upload

User = get_user_model()
PASSWORD = "Prueba-Segura-2026!"


def _bytes(img: Image.Image, fmt: str, **kwargs) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def png_file(size=(200, 100), color="red", name="foto.png") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, _bytes(Image.new("RGB", size, color), "PNG"), "image/png")


def animated_frames(n=4, size=(80, 60)) -> list[Image.Image]:
    # Each frame with a different color (Pillow merges identical frames when saving).
    return [Image.new("RGBA", size, (30 * i + 10, 200 - 30 * i, 90, 255)) for i in range(n)]


def gif_file(n=4, size=(80, 60), loop=0, duration=70) -> SimpleUploadedFile:
    frames = animated_frames(n, size)
    data = _bytes(
        frames[0], "GIF", save_all=True, append_images=frames[1:], duration=duration, loop=loop,
    )
    return SimpleUploadedFile("anim.gif", data, "image/gif")


def webp_anim_file(n=3, size=(64, 64)) -> SimpleUploadedFile:
    frames = animated_frames(n, size)
    data = _bytes(
        frames[0], "WEBP", save_all=True, append_images=frames[1:], duration=90, loop=0,
        lossless=True,
    )
    return SimpleUploadedFile("anim.webp", data, "image/webp")


def open_result(f) -> Image.Image:
    return Image.open(io.BytesIO(f.read() if hasattr(f, "read") else f))


class ProcessUploadTests(SimpleTestCase):
    def test_crop_output_size_and_format(self):
        out = process_upload(png_file((300, 200)), (50, 20, 100, 100))
        img = open_result(out)
        self.assertEqual(img.format, "PNG")
        self.assertEqual(img.size, (100, 100))
        self.assertEqual(out.name, "upload.png")

    def test_downscales_to_max_side_without_upscaling(self):
        big = open_result(process_upload(png_file((1200, 1200)), (0, 0, 1200, 1200), max_side=512))
        self.assertEqual(big.size, (512, 512))
        small = open_result(process_upload(png_file((40, 40)), (0, 0, 40, 40)))
        self.assertEqual(small.size, (40, 40))

    def test_no_crop_means_centered_square(self):
        img = open_result(process_upload(png_file((300, 200))))
        self.assertEqual(img.size, (200, 200))

    def test_jpeg_stays_jpeg(self):
        raw = _bytes(Image.new("RGB", (120, 80), "blue"), "JPEG")
        out = process_upload(SimpleUploadedFile("a.jpg", raw, "image/jpeg"), (10, 0, 80, 80))
        img = open_result(out)
        self.assertEqual((img.format, img.size), ("JPEG", (80, 80)))

    def test_animated_gif_keeps_frames_loop_duration_and_crops(self):
        out = process_upload(gif_file(n=4, size=(80, 60), loop=0, duration=70), (10, 0, 60, 60))
        img = open_result(out)
        self.assertEqual(img.format, "GIF")
        self.assertEqual(img.n_frames, 4)
        self.assertEqual(img.size, (60, 60))
        self.assertEqual(img.info.get("loop"), 0)
        self.assertEqual(img.info.get("duration"), 70)

    def test_animated_gif_keeps_transparency(self):
        frames = []
        for i in range(3):
            im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
            im.paste((255, 20 * i + 40, 0, 255), (8, 8, 24, 24))
            frames.append(im)
        raw = _bytes(frames[0], "GIF", save_all=True, append_images=frames[1:], duration=50, loop=0)
        out = process_upload(SimpleUploadedFile("t.gif", raw, "image/gif"), (0, 0, 32, 32))
        img = open_result(out)
        img.seek(0)
        self.assertEqual(img.convert("RGBA").getpixel((1, 1))[3], 0)
        self.assertEqual(img.convert("RGBA").getpixel((16, 16))[3], 255)

    def test_animated_webp_keeps_frames(self):
        out = process_upload(webp_anim_file(n=3, size=(64, 64)), (0, 0, 32, 32))
        img = open_result(out)
        self.assertEqual(img.format, "WEBP")
        self.assertEqual(img.n_frames, 3)
        self.assertEqual(img.size, (32, 32))

    def test_too_many_frames_is_rejected(self):
        frames = [Image.new("RGB", (4, 4), (i % 256, (i * 7) % 256, (i * 13) % 256)) for i in range(MAX_FRAMES + 1)]
        raw = _bytes(frames[0], "GIF", save_all=True, append_images=frames[1:], duration=20, loop=0)
        with self.assertRaises(ValidationError):
            process_upload(SimpleUploadedFile("big.gif", raw, "image/gif"))

    def test_not_an_image_is_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            process_upload(SimpleUploadedFile("x.png", b"esto no es una imagen", "image/png"))
        self.assertIn("no es una imagen", str(ctx.exception.detail[0]))

    def test_unsupported_real_format_is_rejected(self):
        raw = _bytes(Image.new("RGB", (10, 10), "red"), "BMP")
        with self.assertRaises(ValidationError):
            process_upload(SimpleUploadedFile("x.png", raw, "image/png"))

    def test_crop_out_of_range_is_rejected(self):
        for crop in [(150, 0, 100, 100), (0, 0, 500, 500), (-20, 0, 50, 50), (0, 0, 0, 50)]:
            with self.assertRaises(ValidationError, msg=str(crop)):
                process_upload(png_file((200, 100)), crop)

    def test_size_limit(self):
        f = png_file((300, 300))
        with self.assertRaises(ValidationError) as ctx:
            process_upload(f, max_bytes=100)
        self.assertIn("Imagen demasiado grande", str(ctx.exception.detail[0]))


class ImageEndpointsTests(APITestCase):
    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.user = User.objects.create_user(email="a@img.test", username="a", password=PASSWORD)
        self.other = User.objects.create_user(email="b@img.test", username="b", password=PASSWORD)
        self.client.force_authenticate(self.user)

    # --- user: avatar and icon -------------------------------------------

    def test_avatar_is_cropped_and_resized(self):
        res = self.client.patch("/api/auth/me/", {
            "avatar": png_file((300, 200)),
            "crop_x": "50", "crop_y": "0", "crop_w": "200", "crop_h": "200",
        }, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar.name.endswith(".png"))
        with Image.open(self.user.avatar.path) as img:
            self.assertEqual(img.size, (200, 200))

    def test_avatar_accepts_animated_gif(self):
        res = self.client.patch("/api/auth/me/", {"avatar": gif_file(n=5)}, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar.name.endswith(".gif"))
        with Image.open(self.user.avatar.path) as img:
            self.assertEqual(img.n_frames, 5)

    def test_avatar_rejects_non_image_and_bad_crop(self):
        res = self.client.patch("/api/auth/me/", {
            "avatar": SimpleUploadedFile("a.png", b"no soy imagen", "image/png"),
        }, format="multipart")
        self.assertEqual(res.status_code, 400)
        res = self.client.patch("/api/auth/me/", {
            "avatar": png_file((100, 100)),
            "crop_x": "90", "crop_y": "0", "crop_w": "50", "crop_h": "50",
        }, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_sidebar_icon_is_processed(self):
        res = self.client.patch("/api/auth/me/", {
            "sidebar_icon": gif_file(n=3),
            "crop_x": "0", "crop_y": "0", "crop_w": "60", "crop_h": "60",
        }, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        with Image.open(self.user.sidebar_icon.path) as img:
            self.assertEqual((img.n_frames, img.size), (3, (60, 60)))

    # --- institution --------------------------------------------------------

    def test_organization_logo_is_processed(self):
        org = Organization.objects.create(owner=self.user, name="Uni")
        res = self.client.patch(f"/api/organizations/{org.pk}/", {
            "logo": png_file((200, 100)),
            "crop_x": "0", "crop_y": "0", "crop_w": "100", "crop_h": "100",
        }, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        org.refresh_from_db()
        with Image.open(org.logo.path) as img:
            self.assertEqual(img.size, (100, 100))
        res = self.client.patch(f"/api/organizations/{org.pk}/", {
            "logo": SimpleUploadedFile("l.png", b"nada", "image/png"),
        }, format="multipart")
        self.assertEqual(res.status_code, 400)

    # --- person photo ----------------------------------------------------

    def _post_photo(self, person, **extra):
        data = {"file": png_file((300, 200))}
        data.update(extra)
        return self.client.post(f"/api/persons/{person.pk}/profile_photo/", data, format="multipart")

    def test_person_photo_upload_replace_and_delete(self):
        person = Person.objects.create(owner=self.user, first_name="Ana")
        res = self._post_photo(person, crop_x="0", crop_y="0", crop_w="200", crop_h="200")
        self.assertEqual(res.status_code, 201, res.content)
        photo_id = res.json()["profile_photo"]
        att = Attachment.objects.get(pk=photo_id)
        self.assertEqual((att.owner_id, att.subject_id, att.mime_type), (self.user.pk, person.pk, "image/png"))

        # Served through the existing thumb (decrypted).
        thumb = self.client.get(f"/api/attachments/{photo_id}/thumb/?w=64")
        self.assertEqual(thumb.status_code, 200)
        with Image.open(io.BytesIO(thumb.content)) as img:
            self.assertLessEqual(img.width, 64)

        # It does not show up as an attachment nor count in attachments_count.
        listing = self.client.get(f"/api/attachments/?subject_type=person&subject_id={person.pk}")
        self.assertEqual(listing.json()["results"] if isinstance(listing.json(), dict) else listing.json(), [])
        self.assertEqual(self.client.get(f"/api/persons/{person.pk}/").json()["attachments_count"], 0)

        # Replacement: the previous one is deleted.
        res = self._post_photo(person)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertNotEqual(res.json()["profile_photo"], photo_id)
        self.assertFalse(Attachment.objects.filter(pk=photo_id).exists())

        # Remove.
        res = self.client.delete(f"/api/persons/{person.pk}/profile_photo/")
        self.assertEqual(res.status_code, 204)
        person.refresh_from_db()
        self.assertIsNone(person.profile_photo)
        self.assertEqual(Attachment.objects.count(), 0)

    def test_person_photo_rejects_bad_files(self):
        person = Person.objects.create(owner=self.user, first_name="Ana")
        res = self.client.post(f"/api/persons/{person.pk}/profile_photo/", {
            "file": SimpleUploadedFile("x.png", b"no imagen", "image/png"),
        }, format="multipart")
        self.assertEqual(res.status_code, 400)
        res = self._post_photo(person, crop_x="250", crop_y="0", crop_w="100", crop_h="100")
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f"/api/persons/{person.pk}/profile_photo/", {}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_person_photo_owner_scoping(self):
        foreign = Person.objects.create(owner=self.other, first_name="Ajena")
        self.assertEqual(self._post_photo(foreign).status_code, 404)
        self.assertEqual(
            self.client.delete(f"/api/persons/{foreign.pk}/profile_photo/").status_code, 404,
        )
        # Another person's photo is not accessible by id.
        self.client.force_authenticate(self.other)
        self.assertEqual(self._post_photo(foreign).status_code, 201)
        photo_id = Person.objects.get(pk=foreign.pk).profile_photo_id
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(f"/api/attachments/{photo_id}/thumb/").status_code, 404)

    def test_profile_photo_is_read_only_on_person_patch(self):
        mine = Person.objects.create(owner=self.user, first_name="Ana")
        foreign = Person.objects.create(owner=self.other, first_name="Ajena")
        self.client.force_authenticate(self.other)
        self._post_photo(foreign)
        foreign_att = Person.objects.get(pk=foreign.pk).profile_photo_id
        self.client.force_authenticate(self.user)
        self.client.patch(f"/api/persons/{mine.pk}/", {"profile_photo": foreign_att}, format="json")
        mine.refresh_from_db()
        self.assertIsNone(mine.profile_photo_id)
