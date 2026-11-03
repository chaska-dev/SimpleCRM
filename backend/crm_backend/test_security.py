"""
Phase F tests: MultiFernet encryption, key rotation, check_encryption,
production configuration, protected /media/ and login attempt limit.
"""

import io
import json
import shutil
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import Client, SimpleTestCase, TestCase, override_settings

from crm.fields import (
    EncryptedTextField,
    UndecryptableValue,
    get_encryption_keys,
    looks_like_fernet_token,
)
from crm.models import Note, Organization, Person
from crm_attachment.models import Attachment

from .config_checks import is_insecure_secret_key, validate_production_config

User = get_user_model()

FAST_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
PASSWORD = "x-Test-pass-123"


def new_key() -> str:
    return Fernet.generate_key().decode()


def make_user(email: str):
    return User.objects.create_user(email=email, username=email.split("@")[0], password=PASSWORD)


def raw_column(model, column, pk):
    with connection.cursor() as cur:
        cur.execute(
            f"SELECT {column} FROM {model._meta.db_table} WHERE {model._meta.pk.column} = %s", [pk]
        )
        return cur.fetchone()[0]


def set_raw_column(model, column, pk, value):
    with connection.cursor() as cur:
        cur.execute(
            f"UPDATE {model._meta.db_table} SET {column} = %s WHERE {model._meta.pk.column} = %s",
            [value, pk],
        )


def run_command(name, *args):
    out, err = io.StringIO(), io.StringIO()
    call_command(name, *args, stdout=out, stderr=err)
    return out.getvalue()


# ---------------------------------------------------------------------------
# MultiFernet
# ---------------------------------------------------------------------------


class MultiFernetTests(SimpleTestCase):
    def setUp(self):
        self.k1, self.k2 = new_key(), new_key()
        self.field = EncryptedTextField()

    def test_single_key_setting_still_works(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=[], FIELD_ENCRYPTION_KEY=self.k1):
            self.assertEqual(get_encryption_keys(), (self.k1,))
            token = self.field.get_prep_value("hola")
            self.assertEqual(self.field.from_db_value(token, None, None), "hola")

    def test_first_key_encrypts_all_keys_decrypt(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=[self.k1], FIELD_ENCRYPTION_KEY=""):
            old_token = self.field.get_prep_value("secreto viejo")
        with override_settings(FIELD_ENCRYPTION_KEYS=[self.k2, self.k1], FIELD_ENCRYPTION_KEY=""):
            # Decrypts what was encrypted with the previous key.
            self.assertEqual(self.field.from_db_value(old_token, None, None), "secreto viejo")
            new_token = self.field.get_prep_value("secreto nuevo")
        # New data opens with the first key alone and NOT with the old one alone.
        self.assertEqual(Fernet(self.k2.encode()).decrypt(new_token.encode()), b"secreto nuevo")
        with self.assertRaises(InvalidToken):
            Fernet(self.k1.encode()).decrypt(new_token.encode())

    def test_removed_key_makes_old_data_unreadable(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=[self.k1], FIELD_ENCRYPTION_KEY=""):
            token = self.field.get_prep_value("dato")
        with override_settings(FIELD_ENCRYPTION_KEYS=[self.k2], FIELD_ENCRYPTION_KEY=""):
            value = self.field.from_db_value(token, None, None)
            # The data is not lost: the raw ciphertext arrives and is stored untouched.
            self.assertIsInstance(value, UndecryptableValue)
            self.assertEqual(self.field.get_prep_value(value), token)
            self.assertIs(type(self.field.get_prep_value(value)), str)

    def test_legacy_single_key_is_decrypt_only_fallback(self):
        # FIELD_ENCRYPTION_KEY stays as a decrypt-only key if there is a list.
        with override_settings(FIELD_ENCRYPTION_KEYS=[self.k2], FIELD_ENCRYPTION_KEY=self.k1):
            self.assertEqual(get_encryption_keys(), (self.k2, self.k1))

    def test_invalid_key_raises_without_leaking_value(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=["no-es-una-clave-fernet"], FIELD_ENCRYPTION_KEY=""):
            with self.assertRaises(ImproperlyConfigured) as cm:
                self.field.get_prep_value("x")
            self.assertNotIn("no-es-una-clave-fernet", str(cm.exception))

    def test_no_key_raises(self):
        with override_settings(FIELD_ENCRYPTION_KEYS=[], FIELD_ENCRYPTION_KEY=""):
            with self.assertRaises(ImproperlyConfigured):
                self.field.get_prep_value("x")


# ---------------------------------------------------------------------------
# Production config
# ---------------------------------------------------------------------------


class ProductionConfigTests(SimpleTestCase):
    def test_debug_skips_checks(self):
        validate_production_config(True, "", [])

    def test_example_and_short_secret_keys_rejected(self):
        for bad in ("", "insecure-dev-key-change-me", "change-me-in-prod", "x" * 10, "changeme" + "z" * 40):
            self.assertTrue(is_insecure_secret_key(bad), bad)
            with self.assertRaises(ImproperlyConfigured):
                validate_production_config(False, bad, [new_key()])

    def test_missing_or_invalid_encryption_keys_rejected(self):
        good_secret = "s" * 50
        with self.assertRaises(ImproperlyConfigured):
            validate_production_config(False, good_secret, [])
        with self.assertRaises(ImproperlyConfigured) as cm:
            validate_production_config(False, good_secret, ["clave-invalida-123"])
        self.assertNotIn("clave-invalida-123", str(cm.exception))

    def test_valid_production_config_passes(self):
        validate_production_config(False, "s" * 50, [new_key(), new_key()])


# ---------------------------------------------------------------------------
# Rotation and check_encryption
# ---------------------------------------------------------------------------


class RotationBase(TestCase):
    def setUp(self):
        self.k1, self.k2 = new_key(), new_key()
        self.media = tempfile.mkdtemp(prefix="crm-test-media-")
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        self.settings = override_settings(
            FIELD_ENCRYPTION_KEYS=[self.k1], FIELD_ENCRYPTION_KEY="", MEDIA_ROOT=self.media
        )
        self.settings.enable()
        self.addCleanup(self.settings.disable)

        self.user = make_user("rot@test.local")
        self.person = Person.objects.create(owner=self.user, first_name="Ana", how_we_met_enc="en la uni")
        self.note = Note.objects.create(person=self.person, body_enc="nota privada")
        self.att = Attachment(
            owner=self.user,
            title="doc",
            original_filename="a.txt",
            subject_type=ContentType.objects.get_for_model(Person),
            subject_id=self.person.pk,
        )
        self.att.file.save("a.txt", ContentFile(b"contenido del adjunto"), save=False)
        self.att.save()

    def use_keys(self, *keys):
        """Change the active keys (the first one encrypts)."""
        override = override_settings(FIELD_ENCRYPTION_KEYS=list(keys), FIELD_ENCRYPTION_KEY="")
        override.enable()
        self.addCleanup(override.disable)

    def file_path(self):
        return Path(self.media) / "attachments" / self.att.file.name


class RotateEncryptionKeyTests(RotationBase):
    def test_rotation_reencrypts_text_and_files_with_primary_key(self):
        self.use_keys(self.k2, self.k1)
        before_text = raw_column(Note, "body_enc", self.note.pk)
        before_file = self.file_path().read_bytes()

        # dry-run: writes nothing.
        out = run_command("rotate_encryption_key", "--dry-run")
        self.assertIn("DRY-RUN", out)
        self.assertEqual(raw_column(Note, "body_enc", self.note.pk), before_text)
        self.assertEqual(self.file_path().read_bytes(), before_file)

        out = run_command("rotate_encryption_key", "--batch-size", "1")
        self.assertIn("failed=0", out)

        after_text = raw_column(Note, "body_enc", self.note.pk)
        after_how = raw_column(Person, "how_we_met_enc", self.person.pk)
        after_file = self.file_path().read_bytes()
        self.assertNotEqual(after_text, before_text)
        self.assertNotEqual(after_file, before_file)
        # Now the primary key alone opens it; the old one alone does not.
        self.assertEqual(Fernet(self.k2.encode()).decrypt(after_text.encode()), b"nota privada")
        self.assertEqual(Fernet(self.k2.encode()).decrypt(after_how.encode()), "en la uni".encode())
        self.assertEqual(Fernet(self.k2.encode()).decrypt(after_file), b"contenido del adjunto")
        with self.assertRaises(InvalidToken):
            Fernet(self.k1.encode()).decrypt(after_text.encode())

        # The old key can now be removed: everything is still readable through the ORM and storage.
        self.use_keys(self.k2)
        self.assertEqual(Note.objects.get(pk=self.note.pk).body_enc, "nota privada")
        with Attachment.objects.get(pk=self.att.pk).file.open() as fh:
            self.assertEqual(fh.read(), b"contenido del adjunto")

    def test_rotation_is_idempotent(self):
        self.use_keys(self.k2, self.k1)
        run_command("rotate_encryption_key")
        snapshot = raw_column(Note, "body_enc", self.note.pk)
        out = run_command("rotate_encryption_key")
        self.assertIn("TOTAL: rotated=0", out)
        self.assertEqual(raw_column(Note, "body_enc", self.note.pk), snapshot)

    def test_unreadable_values_fail_and_are_not_modified(self):
        # Only the new key: data encrypted with k1 cannot be opened.
        self.use_keys(self.k2)
        before = raw_column(Note, "body_enc", self.note.pk)
        with self.assertRaises(CommandError):
            run_command("rotate_encryption_key")
        self.assertEqual(raw_column(Note, "body_enc", self.note.pk), before)


class CheckEncryptionTests(RotationBase):
    def test_ok_on_healthy_data(self):
        out = run_command("check_encryption", "--full")
        self.assertIn("all good", out)

    def test_fails_without_keys(self):
        self.use_keys()
        with self.assertRaises(CommandError):
            run_command("check_encryption")

    def test_fails_on_plaintext_in_enc_column(self):
        set_raw_column(Note, "body_enc", self.note.pk, "texto en claro, no cifrado")
        with self.assertRaises(CommandError):
            run_command("check_encryption")

    def test_fails_when_key_cannot_decrypt(self):
        self.use_keys(self.k2)  # data encrypted with k1
        with self.assertRaises(CommandError):
            run_command("check_encryption")

    def test_fails_when_attachment_file_is_plaintext_or_missing(self):
        self.file_path().write_bytes(b"archivo sin cifrar " * 10)
        with self.assertRaises(CommandError):
            run_command("check_encryption")
        self.file_path().unlink()
        with self.assertRaises(CommandError):
            run_command("check_encryption")

    def test_does_not_print_secrets_or_content(self):
        out = run_command("check_encryption")
        for secret in (self.k1, "nota privada", "en la uni"):
            self.assertNotIn(secret, out)

    def test_structural_token_check(self):
        token = Fernet(self.k1.encode()).encrypt(b"x").decode()
        self.assertTrue(looks_like_fernet_token(token))
        self.assertFalse(looks_like_fernet_token("hola mundo"))
        self.assertFalse(looks_like_fernet_token(""))
        self.assertFalse(looks_like_fernet_token(None))


# ---------------------------------------------------------------------------
# Protected /media/
# ---------------------------------------------------------------------------


class ProtectedMediaTests(TestCase):
    PNG = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
        b"\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\x9b\x8a"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    def setUp(self):
        self.media = tempfile.mkdtemp(prefix="crm-test-media-")
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)

        self.alice = make_user("alice@test.local")
        self.bob = make_user("bob@test.local")
        self.org_alice = Organization.objects.create(owner=self.alice, name="Uni A")
        self.org_bob = Organization.objects.create(owner=self.bob, name="Uni B")

        for rel in (
            f"sidebar_icons/user_{self.alice.pk}.png",
            f"sidebar_icons/user_{self.bob.pk}.png",
            f"avatars/user_{self.alice.pk}.png",
            f"avatars/user_{self.bob.pk}.png",
            f"org_logos/org_{self.org_alice.pk}.png",
            f"org_logos/org_{self.org_bob.pk}.png",
            "attachments/1/2026/01/abcd1234.txt",
            "avatars/user_1.html",
        ):
            path = Path(self.media) / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.PNG)

        self.client = Client()
        self.client.force_login(self.alice)

    def get(self, rel, client=None):
        return (client or self.client).get(f"/media/{rel}")

    def test_anonymous_gets_401(self):
        self.assertEqual(self.get(f"avatars/user_{self.alice.pk}.png", Client()).status_code, 401)

    def test_owner_gets_own_files_with_private_cache(self):
        for rel in (
            f"sidebar_icons/user_{self.alice.pk}.png",
            f"avatars/user_{self.alice.pk}.png",
            f"org_logos/org_{self.org_alice.pk}.png",
        ):
            response = self.get(rel)
            self.assertEqual(response.status_code, 200, rel)
            self.assertEqual(response["Content-Type"], "image/png")
            self.assertIn("private", response["Cache-Control"])
            self.assertEqual(response["X-Content-Type-Options"], "nosniff")
            self.assertEqual(b"".join(response.streaming_content), self.PNG)

    def test_other_users_files_are_404(self):
        for rel in (
            f"sidebar_icons/user_{self.bob.pk}.png",
            f"avatars/user_{self.bob.pk}.png",
            f"org_logos/org_{self.org_bob.pk}.png",
        ):
            self.assertEqual(self.get(rel).status_code, 404, rel)

    def test_attachments_and_unknown_paths_are_404(self):
        for rel in (
            "attachments/1/2026/01/abcd1234.txt",
            "avatars/user_1.html",
            "avatars/",
            "secret.txt",
            f"avatars/user_{self.alice.pk}.png/extra",
        ):
            self.assertEqual(self.get(rel).status_code, 404, rel)

    def test_path_traversal_is_404(self):
        for rel in (
            f"avatars/../avatars/user_{self.alice.pk}.png",
            f"avatars/user_{self.alice.pk}.png/../../attachments/1/2026/01/abcd1234.txt",
            "../manage.py",
            "%2e%2e/manage.py",
            f"avatars%5Cuser_{self.alice.pk}.png",
            f"avatars/user_{self.alice.pk}.png%00.txt",
        ):
            self.assertEqual(self.get(rel).status_code, 404, rel)

    def test_missing_file_is_404_and_post_not_allowed(self):
        Path(self.media, f"avatars/user_{self.alice.pk}.png").unlink()
        self.assertEqual(self.get(f"avatars/user_{self.alice.pk}.png").status_code, 404)
        response = self.client.post(f"/media/avatars/user_{self.alice.pk}.png")
        self.assertEqual(response.status_code, 405)

    def test_conditional_request_returns_304(self):
        rel = f"avatars/user_{self.alice.pk}.png"
        first = self.get(rel)
        etag = first["ETag"]
        second = self.client.get(f"/media/{rel}", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(second.status_code, 304)

    def test_symlink_escaping_media_root_is_404(self):
        outside = tempfile.mkdtemp(prefix="crm-test-outside-")
        self.addCleanup(shutil.rmtree, outside, ignore_errors=True)
        (Path(outside) / "x.png").write_bytes(self.PNG)
        link = Path(self.media) / "avatars" / f"user_{self.alice.pk}.png"
        link.unlink()
        try:
            link.symlink_to(Path(outside) / "x.png")
        except (OSError, NotImplementedError):
            self.skipTest("symlinks no disponibles en este sistema")
        self.assertEqual(self.get(f"avatars/user_{self.alice.pk}.png").status_code, 404)


# ---------------------------------------------------------------------------
# Login attempt limit
# ---------------------------------------------------------------------------


@override_settings(PASSWORD_HASHERS=FAST_HASHERS)
class LoginRateLimitTests(TestCase):
    URL = "/api/auth/login/"

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = make_user("login@test.local")
        self.client = Client()

    def attempt(self, email, password, **extra):
        return self.client.post(
            self.URL, data=json.dumps({"email": email, "password": password}),
            content_type="application/json", **extra,
        )

    def test_blocks_after_five_failed_attempts_even_with_correct_password(self):
        for _ in range(5):
            self.assertEqual(self.attempt("login@test.local", "mala").status_code, 401)
        blocked = self.attempt("login@test.local", "mala")
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked)
        self.assertGreater(int(blocked["Retry-After"]), 0)
        # With the correct password it is also blocked during the window.
        self.assertEqual(self.attempt("login@test.local", PASSWORD).status_code, 429)

    def test_email_is_case_and_space_insensitive(self):
        for email in ("LOGIN@test.local", " login@test.local ", "Login@Test.local", "login@test.local",
                      "login@test.LOCAL"):
            self.assertEqual(self.attempt(email, "mala").status_code, 401)
        self.assertEqual(self.attempt("login@test.local", "mala").status_code, 429)

    def test_other_email_from_same_ip_is_not_blocked_by_pair_limit(self):
        for _ in range(5):
            self.attempt("login@test.local", "mala")
        self.assertEqual(self.attempt("otro@test.local", "mala").status_code, 401)

    def test_other_ip_is_not_blocked(self):
        for _ in range(5):
            self.attempt("login@test.local", "mala")
        response = self.attempt("login@test.local", PASSWORD, REMOTE_ADDR="10.9.9.9")
        self.assertEqual(response.status_code, 200)

    def test_successful_login_resets_counter(self):
        for _ in range(4):
            self.attempt("login@test.local", "mala")
        self.assertEqual(self.attempt("login@test.local", PASSWORD).status_code, 200)
        for _ in range(4):
            self.assertEqual(self.attempt("login@test.local", "mala").status_code, 401)

    @override_settings(LOGIN_RATE_LIMIT_IP_ATTEMPTS=3)
    def test_per_ip_cap_blocks_rotating_emails(self):
        for i in range(3):
            self.assertEqual(self.attempt(f"x{i}@test.local", "mala").status_code, 401)
        self.assertEqual(self.attempt("x99@test.local", "mala").status_code, 429)

    def test_only_login_endpoint_is_limited(self):
        for _ in range(6):
            self.attempt("login@test.local", "mala")
        self.assertEqual(self.client.get("/api/health/").status_code, 200)

    def test_cache_keys_do_not_contain_email_or_ip(self):
        from .ratelimit import _key

        key = _key("pair", "127.0.0.1", "login@test.local")
        self.assertNotIn("login@test.local", key)
        self.assertNotIn("127.0.0.1", key)
