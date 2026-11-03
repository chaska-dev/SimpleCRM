from django.apps import AppConfig


class CrmAttachmentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "crm_attachment"
    verbose_name = "Adjuntos"

    def ready(self) -> None:
        # Import signals so the receivers get registered.
        from . import signals  # noqa: F401
