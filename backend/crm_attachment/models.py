"""
Attachment — binary file encrypted on disk, associated with any domain model
via GenericForeignKey (Person, Note, Interaction, ImportantDate).

Design:
- owner_id is mandatory for owner-scoped listing and quota validation.
- The file goes through `EncryptedFileField` → encrypted with Fernet on disk.
- `subject_type`/`subject_id` link to any model via content_types.
- Metadata is not encrypted (title, description, mime_type, size, original_filename)
  to allow text search and quota validation in SQL.
- `title` and `description` are plain text for v1 search.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from crm.fields import EncryptedFileField


def attachments_upload_to(instance, filename):
    """upload_to naming: {owner_id}/{year}/{month}/{uuid_8}_{filename}."""
    from uuid import uuid4

    # Keep the original extension if it has one, otherwise none.
    if "." in filename:
        _, ext = filename.rsplit(".", 1)
        ext = "." + ext.lower()
    else:
        ext = ""

    from datetime import datetime
    now = datetime.now()
    short_uuid = uuid4().hex[:8]
    # instance.owner may not be set at creation (the view sets it).
    owner_id = getattr(instance.owner, "id", None) or "anon"
    return f"{owner_id}/{now:%Y}/{now:%m}/{short_uuid}{ext}"


class Attachment(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    file = EncryptedFileField(upload_to=attachments_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=80, blank=True, default="")
    size_bytes = models.PositiveBigIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # GenericForeignKey to attach to Person/Note/Interaction/ImportantDate.
    subject_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="+",  # no reverse from ContentType (not needed)
    )
    subject_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey("subject_type", "subject_id")

    class Meta:
        ordering = ("-uploaded_at",)
        indexes = [
            models.Index(fields=["owner", "-uploaded_at"]),
            models.Index(fields=["subject_type", "subject_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.original_filename})"
