import re

from django.db import migrations, models

# Unicode ranges of emojis and pictograms (includes variation selector and ZWJ).
EMOJI_RE = re.compile(
    r"[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF\U00002300-\U000023FF\U0000FE0F\U0000200D]"
)


def clear_emoji_icons(apps, schema_editor):
    """Empties `icon` where it holds an emoji (the UI uses its own icons)."""
    ImportantDate = apps.get_model("crm", "ImportantDate")
    for pk, icon in ImportantDate.objects.exclude(icon="").values_list("pk", "icon"):
        if EMOJI_RE.search(icon):
            ImportantDate.objects.filter(pk=pk).update(icon="")


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0007_person_cadence_days_max_3650'),
    ]

    operations = [
        migrations.AlterField(
            model_name='importantdate',
            name='icon',
            field=models.CharField(blank=True, default='', max_length=8),
        ),
        migrations.RunPython(clear_emoji_icons, migrations.RunPython.noop),
    ]
