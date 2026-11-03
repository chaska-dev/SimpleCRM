"""
Checks the encryption state. Exits with code != 0 if anything is wrong.

Checks:
 1. There is at least one key and all of them are valid Fernet keys.
 2. A sample of rows of each *_enc field decrypts (--sample N, default 50;
    --full decrypts everything).
 3. No *_enc field stores plaintext: every non-empty value must have the shape of a
    Fernet token (structural check over ALL rows, no key needed).
 4. Attachment files exist, have the shape of a Fernet token and the sample
    decrypts.
 5. Reports how many values are still encrypted with a key that is no longer the primary
    (pending `rotate_encryption_key`); this is not a failure.

Never prints decrypted content or keys.
"""

from __future__ import annotations

from cryptography.fernet import InvalidToken
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from crm.fields import (
    _get_fernet,
    get_encryption_keys,
    is_current_token,
    iter_encrypted_file_fields,
    iter_encrypted_text_fields,
    looks_like_fernet_token,
)


class Command(BaseCommand):
    help = "Checks keys, decryption of a sample and that there is no plaintext in *_enc fields."

    def add_arguments(self, parser):
        parser.add_argument("--sample", type=int, default=50, help="Rows to decrypt per field (default 50).")
        parser.add_argument("--full", action="store_true", help="Decrypt all rows and files.")

    def handle(self, *args, **options):
        problems: list[str] = []
        sample = None if options["full"] else max(1, options["sample"])

        # 1. Keys
        keys = get_encryption_keys()
        if not keys:
            raise CommandError("FAILED: no encryption keys (FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_KEY).")
        try:
            fernet = _get_fernet()
        except ImproperlyConfigured as exc:
            raise CommandError(f"FAILED: {exc}") from exc
        # Round trip with the primary key.
        if fernet.decrypt(fernet.encrypt(b"check")) != b"check":
            raise CommandError("FAILED: the primary key cannot encrypt and decrypt.")
        self.stdout.write(f"OK keys: {len(keys)} configured, all valid.")

        pending_rotation = 0

        # 2 and 3. Text fields
        qn = connection.ops.quote_name
        for model, field in iter_encrypted_text_fields():
            label = f"{model._meta.label}.{field.column}"
            table = qn(model._meta.db_table)
            pk_col = qn(model._meta.pk.column)
            col = qn(field.column)
            total = plaintext = undecryptable = old_key = checked = 0
            with connection.cursor() as cur:
                cur.execute(f"SELECT {pk_col}, {col} FROM {table} ORDER BY {pk_col}")
                while True:
                    rows = cur.fetchmany(1000)
                    if not rows:
                        break
                    for _pk, raw in rows:
                        if raw is None or raw == "":
                            continue
                        total += 1
                        if not looks_like_fernet_token(raw):
                            plaintext += 1
                            continue
                        if sample is None or checked < sample:
                            checked += 1
                            try:
                                fernet.decrypt(raw.encode("utf-8"))
                            except InvalidToken:
                                undecryptable += 1
                                continue
                            if not is_current_token(raw):
                                old_key += 1
            pending_rotation += old_key
            status = "OK" if not (plaintext or undecryptable) else "FAILED"
            self.stdout.write(
                f"{status} {label}: rows={total} decrypted={checked - undecryptable} "
                f"plaintext={plaintext} undecryptable={undecryptable}"
            )
            if plaintext:
                problems.append(f"{label}: {plaintext} plaintext value(s)")
            if undecryptable:
                problems.append(f"{label}: {undecryptable} value(s) cannot be decrypted with the current keys")

        # 4. Files
        for model, field in iter_encrypted_file_fields():
            label = f"{model._meta.label}.{field.name} (files)"
            storage = field.storage
            names = model._default_manager.exclude(**{field.name: ""}).values_list(field.name, flat=True)
            total = missing = plaintext = undecryptable = checked = old_key = 0
            for name in names.iterator(chunk_size=500):
                if not name:
                    continue
                total += 1
                try:
                    with open(storage._full_path(name), "rb") as fh:
                        token = fh.read()
                except OSError:
                    missing += 1
                    continue
                if not looks_like_fernet_token(token):
                    plaintext += 1
                    continue
                if sample is None or checked < sample:
                    checked += 1
                    try:
                        fernet.decrypt(token)
                    except InvalidToken:
                        undecryptable += 1
                        continue
                    if not is_current_token(token):
                        old_key += 1
            pending_rotation += old_key
            status = "OK" if not (missing or plaintext or undecryptable) else "FAILED"
            self.stdout.write(
                f"{status} {label}: files={total} missing={missing} unencrypted={plaintext} "
                f"undecryptable={undecryptable}"
            )
            if missing:
                problems.append(f"{label}: {missing} file(s) missing on disk")
            if plaintext:
                problems.append(f"{label}: {plaintext} unencrypted file(s)")
            if undecryptable:
                problems.append(f"{label}: {undecryptable} file(s) cannot be decrypted with the current keys")

        if pending_rotation:
            self.stdout.write(
                f"Warning: {pending_rotation} sampled value(s) are still on an older key; "
                "run rotate_encryption_key."
            )

        if problems:
            for p in problems:
                self.stderr.write(f"FAILED: {p}")
            raise CommandError(f"check_encryption: {len(problems)} problem(s) found.")
        self.stdout.write(self.style.SUCCESS("check_encryption: all good."))
