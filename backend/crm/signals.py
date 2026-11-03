"""
Signals for the CRM domain.

- post_save Interaction: updates Person.last_contacted_at to the MAX if
  counts_as_contact=True. The signal does NOT overwrite a manual override if
  the new value would be lower (the user's manual edit is respected).
- post_delete Interaction: recomputes last_contacted_at by re-deriving it.
- post_save Reminder (completed=True with person and recur=yearly): automatically
  creates an Interaction(kind=call, counts_as_contact=True) to record the
  contact and update last_contacted_at.
"""

from __future__ import annotations

from django.db.models import Max
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone


@receiver(post_save, sender="crm.Interaction")
def update_last_contacted_on_save(sender, instance, created, **kwargs):
    """If the interaction counts as contact, recompute last_contacted_at."""
    from .models import Interaction, Person

    if not instance.counts_as_contact:
        return

    person = instance.person
    last = (
        Interaction.objects
        .filter(person=person, counts_as_contact=True)
        .aggregate(m=Max("occurred_at"))["m"]
    )
    if last is None:
        return

    # Only update if (a) it was null or (b) the new MAX is more recent than
    # the current value. update() avoids signal recursion.
    if person.last_contacted_at is None or last > person.last_contacted_at:
        Person.objects.filter(pk=person.pk).update(last_contacted_at=last)


@receiver(post_delete, sender="crm.Interaction")
def update_last_contacted_on_delete(sender, instance, **kwargs):
    """Recompute last_contacted_at when an interaction is deleted."""
    from .models import Interaction, Person

    if not instance.counts_as_contact:
        return

    person = instance.person
    last = (
        Interaction.objects
        .filter(person=person, counts_as_contact=True)
        .aggregate(m=Max("occurred_at"))["m"]
    )
    # If no interaction is left, last_contacted_at ends up null.
    Person.objects.filter(pk=person.pk).update(last_contacted_at=last)


@receiver(post_save, sender="crm.Reminder")
def auto_create_interaction_on_reminder_complete(sender, instance, created, **kwargs):
    """
    If a Reminder goes from not completed to completed and has:
      - `person` set
      - `recur == 'yearly'`

    It creates an Interaction(kind=call, occurred_at=now, counts_as_contact=True)
    to reflect that the user actually made the contact.

    Only acts on the transition: `Reminder._loaded_completed` holds the value
    loaded from the DB (see Reminder.from_db) and is updated when save()
    finishes, so inside post_save it still has the previous value. Saving an
    already completed reminder again does not create another Interaction.

    Decision D12 of db plan v1.
    """
    from .models import Interaction

    if not instance.completed or instance.person_id is None:
        return
    if instance.recur != "yearly":
        return

    was_completed = False if created else getattr(instance, "_loaded_completed", None)
    if was_completed is None or was_completed:
        # None = deferred field: without a previous value the transition cannot be asserted.
        return

    Interaction.objects.create(
        person=instance.person,
        kind="call",
        occurred_at=timezone.now(),
        channel="",
        body_enc=f"Recordatorio completado: {instance.title}",
        counts_as_contact=True,
    )
    # Interaction's update_last_contacted_on_save signal updates
    # Person.last_contacted_at. This reminder is not cloned to next year:
    # recurrence does not generate copies, it only records this time's contact.
