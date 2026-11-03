"""
Re-encrypts all protected data with the current primary key.

Rotation procedure (see docs/ops/encryption.md):
 1. Generate a new key: python scripts/generate-secrets.py --new-encryption-key
 2. Put it FIRST in FIELD_ENCRYPTION_KEYS, leaving the old one behind it (new,old) and
    restart the backend: with MultiFernet everything stays readable.
 3. manage.py rotate_encryption_key --dry-run     (counts what would change)
 4. manage.py rotate_encryption_key               (re-encrypts)
 5. manage.py check_encryption --full             (must exit with 0)
 6. Only then remove the old key from FIELD_ENCRYPTION_KEYS.

What it re-encrypts:
- All EncryptedTextField (*_enc) fields of all installed models, read and
  written with raw SQL (the already-encrypted token, bypassing the field's encryption).
  In batches (--batch-size), one transaction per batch.
- Attachment files (EncryptedFileField): rewritten atomically
  (temp file + os.replace), one at a time.

It is idempotent and resumable: whatever is already encrypted with the primary key is skipped.
A value that no key can open is NOT touched and is reported as a failure (exit code != 0).
"""

from __future__ import annotations

import os
import tempfile

from cryptography.fernet import InvalidToken
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from crm.fields import (
    get_encryption_keys,
    is_current_token,
    iter_encrypted_file_fields,
    iter_encrypted_text_fields,
    looks_like_fernet_token,
    rotate_token,
)


class Command(BaseCommand):
    help = "Re-encrypts *_enc fields and Attachment files with the primary key of FIELD_ENCRYPTION_KEYS."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only counts; writes nothing.")
        parser.add_argument("--batch-size", type=int, default=500, help="Rows per transaction (default 500).")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        batch_size = max(1, options["batch_size"])

        keys = get_encryption_keys()
        if not keys:
            raise CommandError("No encryption keys configured (FIELD_ENCRYPTION_KEYS).")
        if len(keys) == 1:
            self.stdout.write(
                "Warning: only one key is configured. To rotate, put the new key "
                "first in FIELD_ENCRYPTION_KEYS (new,old)."
            )

        mode = "DRY-RUN" if dry else "REAL"
        self.stdout.write(f"Encryption rotation ({mode}), {len(keys)} key(s), primary = #1.")

        totals = {"rotated": 0, "current": 0, "empty": 0, "failed": 0}

        for model, field in iter_encrypted_text_fields():
            counts = self._rotate_text_field(model, field, dry, batch_size)
            self._report(f"{model._meta.label}.{field.column}", counts)
            for k, v in counts.items():
                totals[k] += v

        for model, field in iter_encrypted_file_fields():
            counts = self._rotate_file_field(model, field, dry, batch_size)
            self._report(f"{model._meta.label}.{field.name} (files)", counts)
            for k, v in counts.items():
                totals[k] += v

        verb = "would_rotate" if dry else "rotated"
        self.stdout.write(
            f"TOTAL: {verb}={totals['rotated']} already_current={totals['current']} "
            f"empty={totals['empty']} failed={totals['failed']}"
        )
        if totals["failed"]:
            raise CommandError(
                f"{totals['failed']} value(s) could not be opened with any configured key; "
                "they were not modified. Add the missing key to FIELD_ENCRYPTION_KEYS."
            )
        if not dry:
            self.stdout.write(
                "Next step: manage.py check_encryption --full and, if it exits 0, remove the old keys."
            )

    def _report(self, label: str, counts: dict) -> None:
        self.stdout.write(
            f"  {label}: rotated={counts['rotated']} current={counts['current']} "
            f"empty={counts['empty']} failed={counts['failed']}"
        )

    # ------------------------------------------------------------------ text

    def _rotate_text_field(self, model, field, dry: bool, batch_size: int) -> dict:
        counts = {"rotated": 0, "current": 0, "empty": 0, "failed": 0}
        qn = connection.ops.quote_name
        table = qn(model._meta.db_table)
        pk_col = qn(model._meta.pk.column)
        col = qn(field.column)
        last_pk = None

        while True:
            where = f"WHERE {pk_col} > %s" if last_pk is not None else ""
            params = [last_pk] if last_pk is not None else []
            with connection.cursor() as cur:
                cur.execute(
                    f"SELECT {pk_col}, {col} FROM {table} {where} ORDER BY {pk_col} LIMIT {int(batch_size)}",
                    params,
                )
                rows = cur.fetchall()
            if not rows:
                break
            last_pk = rows[-1][0]

            updates = []
            for pk, raw in rows:
                if raw is None or raw == "":
                    counts["empty"] += 1
                    continue
                if not looks_like_fernet_token(raw):
                    counts["failed"] += 1
                    continue
                try:
                    if is_current_token(raw):
                        counts["current"] += 1
                        continue
                    new_token = rotate_token(raw).decode("utf-8")
                except InvalidToken:
                    counts["failed"] += 1
                    continue
                updates.append((new_token, pk))

            if updates and not dry:
                with transaction.atomic():
                    with connection.cursor() as cur:
                        cur.executemany(
                            f"UPDATE {table} SET {col} = %s WHERE {pk_col} = %s", updates
                        )
            counts["rotated"] += len(updates)
        return counts

    # ---------------------------------------------------------------- files

    def _rotate_file_field(self, model, field, dry: bool, batch_size: int) -> dict:
        counts = {"rotated": 0, "current": 0, "empty": 0, "failed": 0}
        storage = field.storage
        qs = model._default_manager.exclude(**{field.name: ""}).values_list("pk", field.name)
        for pk, name in qs.iterator(chunk_size=batch_size):
            if not name:
                counts["empty"] += 1
                continue
            full = storage._full_path(name)
            try:
                with open(full, "rb") as fh:
                    token = fh.read()
            except OSError:
                counts["failed"] += 1
                continue
            if not looks_like_fernet_token(token):
                counts["failed"] += 1
                continue
            try:
                if is_current_token(token):
                    counts["current"] += 1
                    continue
                new_token = rotate_token(token)
            except InvalidToken:
                counts["failed"] += 1
                continue
            if not dry:
                self._atomic_write(full, new_token)
            counts["rotated"] += 1
        return counts

    @staticmethod
    def _atomic_write(path: str, data: bytes) -> None:
        directory = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".rot-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
