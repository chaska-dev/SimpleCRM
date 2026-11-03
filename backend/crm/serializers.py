"""
DRF serializers for the CRM v1 domain.
"""

from __future__ import annotations

from rest_framework import serializers

from crm_backend.images import crop_from_data, process_upload

from .models import (
    ContactInfo,
    ImportantDate,
    Interaction,
    Note,
    Organization,
    Person,
    PersonOrganization,
    Reminder,
    Tag,
)


# 1 MB for institution logos and important-date icons.
ORGANIZATION_LOGO_MAX_BYTES = 1024 * 1024
ORGANIZATION_LOGO_EXTENSIONS = ("png", "jpg", "jpeg", "webp")


def validate_small_image(value):
    """Allowed extension and max size (1 MB). Shared by logos and icons."""
    if value is None:
        return value
    ext = (value.name.rsplit(".", 1)[-1] if "." in value.name else "").lower()
    if ext not in ORGANIZATION_LOGO_EXTENSIONS:
        raise serializers.ValidationError("Formato no permitido. Usa png, jpg, jpeg o webp.")
    if value.size > ORGANIZATION_LOGO_MAX_BYTES:
        raise serializers.ValidationError(
            f"Imagen demasiado grande ({value.size // 1024} KB). Máximo 1 MB."
        )
    return value


def _request_user(serializer):
    """User from the context (real request or the MCP SimpleNamespace)."""
    return getattr(serializer.context.get("request"), "user", None)


class TagSerializer(serializers.ModelSerializer):
    person_count = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ("id", "name", "color", "person_count", "created_at")
        read_only_fields = ("id", "created_at", "person_count")

    def get_person_count(self, obj: Tag) -> int:
        """Owner's persons with this tag. Uses the viewset annotation if present."""
        annotated = getattr(obj, "person_count", None)
        if annotated is not None:
            return annotated
        if obj.pk is None:
            return 0
        return obj.persons.filter(owner_id=obj.owner_id).count()

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        qs = Tag.objects.filter(owner=_request_user(self), name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe una etiqueta con ese nombre.")
        return value


class PersonSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source="tags",
    )
    notes_count = serializers.IntegerField(source="_notes_count", read_only=True, required=False)
    interactions_count = serializers.IntegerField(
        source="_interactions_count", read_only=True, required=False,
    )
    cadence_status = serializers.CharField(read_only=True, required=False)
    contact_types = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = (
            "id",
            "first_name",
            "last_name",
            "nick_name",
            "company",
            "role",
            "how_we_met",  # <- virtual, alias of the decrypted how_we_met_enc, see SerializerMethodField
            "favorite",
            "cadence_days",
            "last_contacted_at",
            "tags",
            "tag_ids",
            "notes_count",
            "interactions_count",
            "cadence_status",
            "contact_types",
            "organizations",
            "profile_photo",  # Attachment id (read-only; POST /persons/{id}/profile_photo/)
            "attachments_count",  # see SerializerMethodField below
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "created_at", "updated_at", "tags",
            "notes_count", "interactions_count", "cadence_status",
            "contact_types", "organizations", "profile_photo", "attachments_count",
            "created_via",
        )

    # Virtual fields that map to/from the *_enc columns.
    how_we_met = serializers.CharField(
        source="how_we_met_enc",
        required=False, allow_blank=True, default="",
        write_only=False,
    )

    # attachments_count via SerializerMethodField to count from the GenericRelation.
    attachments_count = serializers.SerializerMethodField()

    def get_attachments_count(self, obj: Person) -> int:
        from crm_attachment.models import Attachment
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(Person)
        # The profile photo is an Attachment of the person, but does not count as an attachment.
        return Attachment.objects.filter(
            subject_type=ct, subject_id=obj.pk, owner=obj.owner,
        ).exclude(pk=obj.profile_photo_id).count()

    def get_contact_types(self, obj: Person) -> list[str]:
        """
        List of contact types this person has loaded
        (e.g. ["whatsapp", "instagram", "linkedin"]). Lets the
        PersonCard show icons without N extra requests. Types only,
        never values (privacy + small payload).
        """
        return list(
            obj.contacts_info.order_by("type")
            .values_list("type", flat=True)
            .distinct()
        )

    def get_organizations(self, obj: Person) -> list[dict]:
        """
        The person's memberships (read-only). Uses `memberships` prefetched
        with select_related("organization") when the viewset provides it.
        """
        rows = sorted(
            obj.memberships.all(),
            key=lambda m: (not m.is_current, m.organization.name.lower()),
        )
        return [
            {
                "membership_id": m.pk,
                "organization_id": m.organization_id,
                "name": m.organization.name,
                "kind": m.organization.kind,
                "role": m.role,
                "is_current": m.is_current,
            }
            for m in rows
        ]

    def validate_tag_ids(self, value):
        owner = self.context["request"].user
        if any(t.owner_id != owner.pk for t in value):
            raise serializers.ValidationError("Todos los tags deben pertenecer al usuario actual.")
        return value

    def create(self, validated_data):
        validated_data["owner"] = self.context["request"].user
        return super().create(validated_data)


class ContactInfoSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    person = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = ContactInfo
        fields = ("id", "person", "type", "type_display", "value", "label", "created_at")
        read_only_fields = ("id", "created_at", "type_display", "person")


class ImportantDateSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(read_only=True, required=False)
    days_until_next = serializers.IntegerField(read_only=True, required=False)
    icon_url = serializers.SerializerMethodField()
    person = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = ImportantDate
        fields = (
            "id",
            "person",
            "kind",
            "birth_year",
            "title",
            "description",
            "icon",
            "icon_image",
            "icon_url",
            "date",
            "recurrence",
            "attachment",
            "age",
            "days_until_next",
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "created_at", "updated_at", "age", "days_until_next", "icon_url",
            "person", "created_via",
        )

    def validate_attachment(self, value):
        user = _request_user(self)
        if value is not None and (user is None or value.owner_id != user.pk):
            raise serializers.ValidationError("El adjunto no pertenece al usuario actual.")
        return value

    def validate_icon_image(self, value):
        return validate_small_image(value)

    def get_icon_url(self, obj: ImportantDate):
        if obj.icon_image:
            request = self.context.get("request")
            url = obj.icon_image.url
            return request.build_absolute_uri(url) if request else url
        return None


class InteractionSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    person = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Interaction
        fields = (
            "id",
            "person",
            "kind",
            "kind_display",
            "occurred_at",
            "channel",
            "body",
            "counts_as_contact",
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "created_at", "updated_at", "kind_display", "person", "created_via",
        )

    # `body` is a human-friendly alias for body_enc.
    body = serializers.CharField(
        source="body_enc",
        required=False, allow_blank=True, default="",
    )


class ParticipantSerializer(serializers.ModelSerializer):
    """Summarized person for `participants_detail` (read-only)."""

    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Person
        fields = ("id", "display_name")
        read_only_fields = fields


class ReminderSerializer(serializers.ModelSerializer):
    participants = serializers.PrimaryKeyRelatedField(
        queryset=Person.objects.all(), many=True, required=False,
    )
    participants_detail = ParticipantSerializer(
        source="participants", many=True, read_only=True,
    )

    class Meta:
        model = Reminder
        fields = (
            "id",
            "title",
            "remind_at",
            "recur",
            "lead_minutes",
            "message",  # alias of message_enc
            "completed",
            "status",
            "kind",
            "location",
            "participants",
            "participants_detail",
            "person",
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "created_via")

    message = serializers.CharField(
        source="message_enc",
        required=False, allow_blank=True, default="",
    )

    def _owner(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def validate_person(self, value):
        if value is not None and value.owner_id != self._owner().pk:
            raise serializers.ValidationError("La persona no pertenece al usuario actual.")
        return value

    def validate_participants(self, value):
        owner = self._owner()
        if any(p.owner_id != owner.pk for p in value):
            raise serializers.ValidationError(
                "Todos los participantes deben pertenecer al usuario actual."
            )
        return value

    def create(self, validated_data):
        validated_data["owner"] = self._owner()
        return super().create(validated_data)


class NoteSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    person = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Note
        fields = (
            "id",
            "person",
            "body",
            "category",
            "category_display",
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "created_at", "updated_at", "category_display", "person", "created_via",
        )

    body = serializers.CharField(source="body_enc")


# ---------------------------------------------------------------------------
# Organization + memberships.
# ---------------------------------------------------------------------------

class OrganizationSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source="tags",
    )
    # FileField (not ImageField): image validation is done by process_upload.
    logo = serializers.FileField(required=False, allow_null=True, max_length=None)
    notes = serializers.CharField(
        source="notes_enc", required=False, allow_blank=True, default="",
    )
    member_count = serializers.SerializerMethodField()
    attachments_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "kind",
            "logo",
            "address",
            "city",
            "country",
            "latitude",
            "longitude",
            "phone",
            "email",
            "website",
            "notes",
            "tags",
            "tag_ids",
            "member_count",
            "attachments_count",
            "created_via",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "tags", "member_count", "attachments_count", "created_via",
            "created_at", "updated_at",
        )

    def _owner(self):
        return self.context["request"].user

    def get_member_count(self, obj: Organization) -> int:
        annotated = getattr(obj, "_member_count", None)
        if annotated is not None:
            return annotated
        return obj.memberships.values("person_id").distinct().count()

    def get_attachments_count(self, obj: Organization) -> int:
        from django.contrib.contenttypes.models import ContentType

        from crm_attachment.models import Attachment

        ct = ContentType.objects.get_for_model(Organization)
        return Attachment.objects.filter(
            subject_type=ct, subject_id=obj.pk, owner=obj.owner,
        ).count()

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        qs = Organization.objects.filter(owner=self._owner(), name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya tienes una institución con ese nombre.")
        return value

    def validate_tag_ids(self, value):
        owner = self._owner()
        if any(t.owner_id != owner.pk for t in value):
            raise serializers.ValidationError("Todos los tags deben pertenecer al usuario actual.")
        return value

    def validate_logo(self, value):
        if value is None:
            return value
        return process_upload(
            value, crop_from_data(getattr(self, "initial_data", None)),
            max_bytes=ORGANIZATION_LOGO_MAX_BYTES,
        )

    def create(self, validated_data):
        validated_data["owner"] = self._owner()
        # The file name depends on the pk: saved after creation.
        logo = validated_data.pop("logo", None)
        instance = super().create(validated_data)
        if logo:
            instance.logo = logo
            instance.save(update_fields=["logo", "updated_at"])
        return instance

    def update(self, instance, validated_data):
        # Django does not delete the old file when the field is replaced or cleared.
        if "logo" in validated_data:
            new_logo = validated_data["logo"]
            if instance.logo:
                instance.logo.delete(save=False)
            validated_data["logo"] = new_logo or None
        return super().update(instance, validated_data)


class PersonOrganizationSerializer(serializers.ModelSerializer):
    """Person-institution membership. `person_id` writes, `person_name` reads."""

    membership_id = serializers.IntegerField(source="pk", read_only=True)
    person_id = serializers.PrimaryKeyRelatedField(
        queryset=Person.objects.all(), source="person",
    )
    person_name = serializers.CharField(source="person.display_name", read_only=True)
    organization_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = PersonOrganization
        fields = (
            "membership_id",
            "person_id",
            "person_name",
            "organization_id",
            "role",
            "is_current",
            "start_year",
            "end_year",
        )
        read_only_fields = ("membership_id", "person_name", "organization_id")
        extra_kwargs = {"role": {"required": False, "allow_blank": True}}

    def validate_person_id(self, value):
        if value.owner_id != self.context["request"].user.pk:
            raise serializers.ValidationError("La persona no pertenece al usuario actual.")
        return value

    def validate(self, attrs):
        organization = self.context["organization"]
        person = attrs.get("person", getattr(self.instance, "person", None))
        role = attrs.get("role", getattr(self.instance, "role", ""))
        dup = PersonOrganization.objects.filter(
            organization=organization, person=person, role=role,
        )
        if self.instance is not None:
            dup = dup.exclude(pk=self.instance.pk)
        if dup.exists():
            raise serializers.ValidationError(
                {"role": "Esa persona ya tiene ese rol en la institución."}
            )
        start = attrs.get("start_year", getattr(self.instance, "start_year", None))
        end = attrs.get("end_year", getattr(self.instance, "end_year", None))
        if start is not None and end is not None and end < start:
            raise serializers.ValidationError(
                {"end_year": "El año de fin no puede ser anterior al de inicio."}
            )
        return attrs
