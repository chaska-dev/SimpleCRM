from __future__ import annotations

from rest_framework import serializers

from .auth import CREATION_TOOLS
from .models import VALID_SCOPES, AgentAction, ApiToken

MAX_ACTIVE_TOKENS = 20


class ApiTokenSerializer(serializers.ModelSerializer):
    """Token reading: never includes the token, its ciphertext or its hash."""

    is_active = serializers.BooleanField(read_only=True)
    can_reveal = serializers.BooleanField(read_only=True)

    class Meta:
        model = ApiToken
        fields = (
            "id", "name", "prefix", "scopes", "created_at", "last_used_at",
            "expires_at", "revoked_at", "is_active", "can_reveal",
        )
        read_only_fields = fields


class ApiTokenCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    scopes = serializers.ListField(
        child=serializers.ChoiceField(choices=VALID_SCOPES), required=False, min_length=1,
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_expires_at(self, value):
        from django.utils import timezone

        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("La fecha de vencimiento debe ser futura.")
        return value

    def validate(self, attrs):
        owner = self.context["request"].user
        active = [t for t in ApiToken.objects.filter(owner=owner) if t.is_active]
        if len(active) >= MAX_ACTIVE_TOKENS:
            raise serializers.ValidationError(
                f"Maximo {MAX_ACTIVE_TOKENS} tokens activos; revoca alguno."
            )
        attrs.setdefault("scopes", ["read", "write"])
        return attrs


class AgentActionSerializer(serializers.ModelSerializer):
    token_name = serializers.SerializerMethodField()
    can_undo = serializers.SerializerMethodField()
    link_person_id = serializers.SerializerMethodField()

    class Meta:
        model = AgentAction
        fields = (
            "id", "tool_name", "arguments", "status", "target_type", "target_id",
            "link_person_id", "error_message", "created_at", "undone_at",
            "token_name", "can_undo",
        )
        read_only_fields = fields

    def get_token_name(self, obj: AgentAction):
        return obj.token.name if obj.token_id else None

    def get_can_undo(self, obj: AgentAction) -> bool:
        return (
            obj.status == "ok"
            and obj.tool_name in CREATION_TOOLS
            and obj.target_id is not None
            and obj.undone_at is None
        )

    def get_link_person_id(self, obj: AgentAction):
        """Person to link the row to (objects that hang from a person)."""
        return (self.context.get("person_links") or {}).get(obj.pk)
