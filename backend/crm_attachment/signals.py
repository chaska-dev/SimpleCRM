"""Attachment signals: the encrypted file on disk is deleted along with the row."""

from __future__ import annotations

import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Attachment

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Attachment)
def delete_attachment_file(sender, instance, **kwargs):
    """Delete the file from storage (also on cascade deletion of a person, note, etc.)."""
    if not instance.file:
        return
    try:
        instance.file.delete(save=False)
    except OSError:
        # The row no longer exists; an orphaned file must not break the deletion.
        logger.warning("Could not delete the file of attachment %s", instance.pk)
