from __future__ import annotations

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from rest_framework import serializers

from .models import Attachment

# Models (app `crm`) an attachment can be attached to, by ContentType name.
ALLOWED_SUBJECT_MODELS = (
    "person",
    "organization",
    "note",
    "interaction",
    "reminder",
    "importantdate",
)


def _subject_owner(obj):
    """Owner of a subject: `obj.owner` (Person/Organization/Reminder) or `obj.person.owner`."""
    owner = getattr(obj, "owner", None)
    if owner is None:
        owner = getattr(getattr(obj, "person", None), "owner", None)
    return owner


def _detect_mime(file_obj) -> str:
    """Real MIME type of the file.

    Images: opened and verified with Pillow and the detected format is used (not the
    content-type declared by the client). Everything else: the declared content-type,
    which must then be in ATTACHMENT_ALLOWED_MIMES.
    """
    declared = (getattr(file_obj, "content_type", "") or "").split(";")[0].strip().lower()
    if not declared.startswith("image/"):
        return declared
    from PIL import Image

    try:
        with Image.open(file_obj) as img:
            img.verify()
            detected = Image.MIME.get(img.format or "")
    except Exception:
        raise serializers.ValidationError({"file": "La imagen no es válida o está dañada."})
    finally:
        file_obj.seek(0)
    if not detected:
        raise serializers.ValidationError({"file": "Formato de imagen no reconocido."})
    return detected


class AttachmentSerializer(serializers.ModelSerializer):
    """Serializer to create / list attachments.

    When editing only `title` and `description` change: file, subject and derived
    metadata (name, size, mime) are immutable.
    """

    # We resolve subject_type by the app_label.model string (slug style)
    # instead of passing the PK. Friendlier to the front end and more stable (ContentType
    # PKs vary between installations if a DB dump is synced).
    subject_type = serializers.CharField(
        max_length=100,
        help_text="App label + '.' + model name, e.g. 'crm.person'.",
    )

    class Meta:
        model = Attachment
        fields = (
            "id",
            "title",
            "description",
            "file",
            "original_filename",
            "mime_type",
            "size_bytes",
            "uploaded_at",
            "subject_type",
            "subject_id",
        )
        read_only_fields = (
            "id", "uploaded_at", "original_filename", "size_bytes", "mime_type",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(self.instance, Attachment):
            for name in ("file", "subject_type", "subject_id"):
                self.fields[name].read_only = True

    def to_representation(self, instance):
        data = super().to_representation(instance)
        ct = instance.subject_type
        data["subject_type"] = f"{ct.app_label}.{ct.model}"
        return data

    def validate_subject_type(self, value):
        try:
            app_label, model = value.strip().lower().split(".", 1)
        except ValueError:
            app_label, model = "", ""
        if app_label != "crm" or model not in ALLOWED_SUBJECT_MODELS:
            raise serializers.ValidationError(
                f"subject_type '{value}' no es válido. Formato: 'crm.<modelo>', "
                f"modelos permitidos: {', '.join(ALLOWED_SUBJECT_MODELS)}."
            )
        try:
            # We return the ContentType so the model stores the FK (not the string).
            return ContentType.objects.get_by_natural_key(app_label, model)
        except ContentType.DoesNotExist:
            raise serializers.ValidationError(f"Modelo desconocido: '{value}'.")

    def validate(self, attrs):
        if self.instance is not None:
            return attrs

        owner = self.context["request"].user

        # Subject: must exist and belong to the user. Same message in both cases so as not to
        # reveal whether someone else's id exists.
        ct = attrs["subject_type"]
        obj = ct.model_class().objects.filter(pk=attrs["subject_id"]).first()
        subject_owner = _subject_owner(obj) if obj is not None else None
        if subject_owner is None or subject_owner.pk != owner.pk:
            raise serializers.ValidationError(
                {"subject_id": "El objeto referenciado no existe."}
            )

        # Size per file
        file_obj = attrs["file"]
        max_bytes = getattr(settings, "ATTACHMENT_MAX_BYTES", 25 * 1024 * 1024)
        if file_obj.size > max_bytes:
            raise serializers.ValidationError(
                {"file": f"El archivo excede el límite de {max_bytes // (1024 * 1024)} MB."}
            )
        mime = _detect_mime(file_obj)
        allowed = set(getattr(settings, "ATTACHMENT_ALLOWED_MIMES", []))
        # Permissive if the list is empty (setting not set). Defensive.
        if allowed and mime not in allowed:
            raise serializers.ValidationError(
                {"file": f"Tipo de archivo no permitido: {mime or 'desconocido'}."}
            )

        # Quota per owner
        quota = getattr(settings, "ATTACHMENT_USER_QUOTA_BYTES", 500 * 1024 * 1024)
        used = (
            Attachment.objects.filter(owner=owner).aggregate(total=Sum("size_bytes"))["total"]
            or 0
        )
        if used + file_obj.size > quota:
            raise serializers.ValidationError(
                {"file": f"Excedes la cuota de {quota // (1024 * 1024)} MB para tu usuario "
                         f"(usas {used // (1024 * 1024)} MB)."}
            )

        # Metadata derived on the server (the client does not control it).
        attrs["mime_type"] = mime
        attrs["original_filename"] = file_obj.name
        attrs["size_bytes"] = file_obj.size
        return attrs

    def create(self, validated_data):
        validated_data["owner"] = self.context["request"].user
        return super().create(validated_data)
