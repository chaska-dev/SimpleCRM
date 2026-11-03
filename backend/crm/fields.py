"""
Encrypted fields for crm/.

- `EncryptedTextField`: TextField persisted encrypted with Fernet.
- `EncryptedFileField`: FileField whose binary content is persisted encrypted on
  disk through `EncryptedFileSystemStorage` (location: MEDIA_ROOT/attachments/).

Encryption keys (rotation with `MultiFernet`):
- `settings.FIELD_ENCRYPTION_KEYS`: list; the FIRST encrypts, ALL decrypt.
- `settings.FIELD_ENCRYPTION_KEY`: single key; treated as a list of one (and, if
  a list is also set, it is appended at the end as a decrypt-only key).
- To rotate: put the new key first (`FIELD_ENCRYPTION_KEYS=new,old`),
  run `manage.py rotate_encryption_key`, verify with `check_encryption` and only
  then remove the old one.

If there is no key at all:
- In dev (DEBUG=True): the fields work, `_get_fernet()` fails with
  ImproperlyConfigured when trying to encrypt/decrypt a non-empty value.
- In prod: settings.py aborts the boot (crm_backend/config_checks.py).

Consistent encryption for all sensitive fields:
    Note.body, Interaction.body, Reminder.message_enc, Person.how_we_met,
    Attachment.file (binario).

Uso:
    from crm.fields import EncryptedTextField, EncryptedFileField

    class Note(models.Model):
        body = EncryptedTextField()

    class Attachment(models.Model):
        file = EncryptedFileField(upload_to="%Y/%m/")
"""

from __future__ import annotations

import os
import base64
import binascii
import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db import models

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Keys and MultiFernet (cached by key tuple, so override_settings in
# tests and env changes work without invalidating anything by hand).
# ---------------------------------------------------------------------------

_GENERATE_HINT = (
    "Generate one with: python -c \"from cryptography.fernet import Fernet; "
    "print(Fernet.generate_key().decode())\""
)


def get_encryption_keys() -> tuple[str, ...]:
    """Effective keys in order: the first encrypts, all decrypt. No duplicates."""
    keys: list[str] = []
    raw_list = getattr(settings, "FIELD_ENCRYPTION_KEYS", None) or []
    if isinstance(raw_list, str):
        raw_list = raw_list.split(",")
    for raw in list(raw_list) + [getattr(settings, "FIELD_ENCRYPTION_KEY", None) or ""]:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        raw = (raw or "").strip()
        if raw and raw not in keys:
            keys.append(raw)
    return tuple(keys)


@lru_cache(maxsize=8)
def _build_multifernet(keys: tuple[str, ...]) -> MultiFernet:
    if not keys:
        raise ImproperlyConfigured(
            "FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_KEY is not set. " + _GENERATE_HINT
        )
    fernets = []
    for index, key in enumerate(keys):
        try:
            fernets.append(Fernet(key.encode("utf-8")))
        except (ValueError, TypeError) as exc:
            # Do not include the key value in the message.
            raise ImproperlyConfigured(
                f"Encryption key #{index + 1} is invalid: {exc}. "
                "It must be a 32-byte url-safe base64 Fernet key."
            ) from exc
    return MultiFernet(fernets)


def _get_fernet() -> MultiFernet:
    """MultiFernet with the current keys from settings (first = encrypts)."""
    return _build_multifernet(get_encryption_keys())


def get_primary_fernet() -> Fernet:
    """Fernet with the primary key only (to tell whether a token is already up to date)."""
    keys = get_encryption_keys()
    _build_multifernet(keys)  # validates all the keys
    return Fernet(keys[0].encode("utf-8"))


def is_current_token(token: bytes | str) -> bool:
    """True if the token is already encrypted with the primary key."""
    if isinstance(token, str):
        token = token.encode("utf-8")
    try:
        get_primary_fernet().decrypt(token)
        return True
    except InvalidToken:
        return False


def rotate_token(token: bytes | str) -> bytes:
    """Re-encrypt a token with the primary key. InvalidToken if no key can open it."""
    if isinstance(token, str):
        token = token.encode("utf-8")
    return _get_fernet().rotate(token)


_FERNET_RAW_MIN_LEN = 1 + 8 + 16 + 16 + 32  # version + timestamp + iv + 1 bloque + hmac


def looks_like_fernet_token(value) -> bool:
    """Structural check (no key): url-safe base64, version 0x80, minimum length."""
    if value is None:
        return False
    if isinstance(value, (bytes, bytearray, memoryview)):
        value = bytes(value)
    elif isinstance(value, str):
        value = value.encode("utf-8")
    else:
        return False
    try:
        raw = base64.urlsafe_b64decode(value)
    except (ValueError, binascii.Error):
        return False
    return len(raw) >= _FERNET_RAW_MIN_LEN and raw[0] == 0x80


def iter_encrypted_text_fields():
    """(model, field) for each concrete EncryptedTextField of the installed models."""
    for model in apps.get_models():
        if model._meta.abstract or model._meta.proxy:
            continue
        for field in model._meta.concrete_fields:
            if isinstance(field, EncryptedTextField):
                yield model, field


def iter_encrypted_file_fields():
    """(model, field) for each concrete EncryptedFileField."""
    for model in apps.get_models():
        if model._meta.abstract or model._meta.proxy:
            continue
        for field in model._meta.concrete_fields:
            if isinstance(field, EncryptedFileField):
                yield model, field


# ---------------------------------------------------------------------------
# EncryptedTextField
# ---------------------------------------------------------------------------


class UndecryptableValue(str):
    """DB value that no key could decrypt (wrong key or corrupt data).

    Holds the original ciphertext. `get_prep_value` returns it untouched, so
    saving the object does not re-encrypt the ciphertext nor replace it with NULL
    (the data is not lost).
    """

    __slots__ = ()


class EncryptedTextField(models.TextField):
    """
    TextField stored encrypted in the DB.

    - Encrypts on save (to_python + get_prep_value).
    - Decrypts on read (from_db_value).
    - If the DB value cannot be decrypted, returns `UndecryptableValue` with the
      raw ciphertext (does not break and does not lose the data when saved again).
    """

    description = "TextField encriptado con Fernet (AES-128-CBC + HMAC-SHA256)."

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        try:
            raw = value.encode("utf-8") if isinstance(value, str) else bytes(value)
            return _get_fernet().decrypt(raw).decode("utf-8")
        except (InvalidToken, ValueError, UnicodeDecodeError):
            # The content is never logged, only the field.
            model = getattr(self, "model", None)
            logger.warning(
                "Undecryptable value in %s.%s",
                model.__name__ if model is not None else "?", self.name,
            )
            if isinstance(value, str):
                return UndecryptableValue(value)
            return UndecryptableValue(bytes(value).decode("utf-8", errors="replace"))

    def to_python(self, value):
        if value is None or isinstance(value, str):
            return value
        try:
            return _get_fernet().decrypt(bytes(value)).decode("utf-8")
        except (InvalidToken, ValueError, UnicodeDecodeError):
            return value

    def get_prep_value(self, value):
        if value is None or value == "":
            return value
        if isinstance(value, UndecryptableValue):
            return str.__str__(value)  # original ciphertext, not re-encrypted
        if isinstance(value, str):
            return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
        return value


# ---------------------------------------------------------------------------
# EncryptedFileSystemStorage - persists encrypted files on disk.
# ---------------------------------------------------------------------------


class EncryptedFileSystemStorage(FileSystemStorage):
    """
    FileSystemStorage that encrypts the content with Fernet when writing it and
    decrypts it when opening. Lives under MEDIA_ROOT/attachments/.

    Do NOT keep backups of MEDIA_ROOT/attachments without the matching
    FIELD_ENCRYPTION_KEYS - without the key the files are unrecoverable.
    """

    BASE_SUBDIR = "attachments"

    def _full_path(self, name: str) -> str:
        return os.path.join(settings.MEDIA_ROOT, self.BASE_SUBDIR, name)

    def _open(self, name, mode="rb"):
        """
        Override of Django 5+ `_open` (parent is `Storage._open`, which delegates to
        FileSystemStorage). Reads the ciphertext from disk and returns a
        ContentFile with the content in plaintext (decrypted).
        """
        full = self._full_path(name)
        with open(full, "rb") as f:
            ciphertext = f.read()
        try:
            plaintext = _get_fernet().decrypt(ciphertext)
        except (InvalidToken, ValueError):
            # File is not valid ciphertext for any key - fall back to returning it
            # as is (legacy unencrypted file). This should NOT happen; the name
            # (never the content) is logged and `check_encryption` reports it.
            logger.warning("Unencrypted file or unknown key: %s", name)
            plaintext = ciphertext
        return ContentFile(plaintext, name=name)

    def _save(self, name, content):
        """
        Encrypts the `content` (File-like) and writes it to disk.
        Returns the final `name` (Django stores and returns it).
        """
        plaintext = content.read()
        if isinstance(plaintext, str):
            plaintext = plaintext.encode("utf-8")
        ciphertext = _get_fernet().encrypt(plaintext)
        full = self._full_path(name)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(ciphertext)
        return name

    def delete(self, name):
        """Delete the encrypted file from disk. Silent if it does not exist."""
        full = self._full_path(name)
        if os.path.exists(full):
            os.remove(full)

    def exists(self, name):
        return os.path.exists(self._full_path(name))

    def url(self, name):
        """
        We do NOT return a direct MEDIA_URL URL because the file is encrypted.
        The client must request `/api/attachments/<id>/download/` to get the
        content decrypted on the fly. We return None to block accidental
        access to the encrypted file via nginx/media.
        """
        return None

    def size(self, name):
        """Size in plaintext (Fernet adds ~57 bytes of overhead)."""
        try:
            with self._open(name) as f:
                return len(f.read())
        except (OSError, ValueError):
            return 0


def get_encrypted_attachment_storage() -> EncryptedFileSystemStorage:
    """
    Singleton-ish: returns a storage instance pointing at
    MEDIA_ROOT/attachments/. Creates the directory if it does not exist.
    """
    location = os.path.join(settings.MEDIA_ROOT, "attachments")
    os.makedirs(location, exist_ok=True)
    return EncryptedFileSystemStorage(location=location)


# ---------------------------------------------------------------------------
# EncryptedFileField
# ---------------------------------------------------------------------------


class EncryptedFileField(models.FileField):
    """
    FileField persisted encrypted on disk via `EncryptedFileSystemStorage`.

    Operational notes:
    - The reported size (`field.size`) is plaintext, not ciphertext.
    - `field.url` returns None (the download API endpoint must be used).
    - Migrations do not serialize `storage`; on reconstruction, `__init__`
      reapplies it via `setdefault`.
    """

    description = "FileField cifrado en disco con Fernet (AES-128-CBC + HMAC-SHA256)."

    def __init__(self, *args, **kwargs):
        if "storage" not in kwargs:
            kwargs["storage"] = get_encrypted_attachment_storage()
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        # The storage class is not serializable in migrations; we reapply it
        # in __init__ when the model is reconstructed.
        kwargs.pop("storage", None)
        return name, path, args, kwargs
