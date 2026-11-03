"""Data migration: completed=True becomes status="done"; the rest stays "todo"."""

from django.db import migrations


def status_from_completed(apps, schema_editor):
    Reminder = apps.get_model("crm", "Reminder")
    Reminder.objects.filter(completed=True).update(status="done")
    Reminder.objects.filter(completed=False).update(status="todo")


def completed_from_status(apps, schema_editor):
    Reminder = apps.get_model("crm", "Reminder")
    Reminder.objects.filter(status="done").update(completed=True)
    Reminder.objects.exclude(status="done").update(completed=False)


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0004_reminder_board_fields_and_organizations"),
    ]

    operations = [
        migrations.RunPython(status_from_completed, completed_from_status),
    ]
