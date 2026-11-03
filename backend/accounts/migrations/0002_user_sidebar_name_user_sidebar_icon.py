from django.core.validators import FileExtensionValidator
from django.db import migrations, models

import accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="sidebar_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Nombre que se muestra en la barra lateral. Vacío = usa el default de la app.",
                max_length=60,
                verbose_name="sidebar name",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="sidebar_icon",
            field=models.ImageField(
                blank=True,
                help_text="Ícono opcional para la barra lateral (png/jpg/webp/gif, máx 500KB).",
                null=True,
                upload_to=accounts.models.sidebar_icon_upload_to,
                validators=[
                    FileExtensionValidator(
                        allowed_extensions=["png", "jpg", "jpeg", "webp", "gif"]
                    )
                ],
                verbose_name="sidebar icon",
            ),
        ),
    ]