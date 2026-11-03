from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from crm_backend.images import crop_from_data, process_upload

User = get_user_model()

# 500 KB — the front end already validates before uploading, but the server stays as
# a second line of defense. Measured on the original file the client uploads.
SIDEBAR_ICON_MAX_BYTES = 500 * 1024

# Profile photo: 2 MB. Formats png/jpg/webp/gif (see crm_backend/images.py).
AVATAR_MAX_BYTES = 2 * 1024 * 1024


class UserSerializer(serializers.ModelSerializer):
    """Serializer for reading/partially writing the current user."""

    # FileField (not ImageField): image validation is done by process_upload.
    sidebar_icon = serializers.FileField(
        required=False,
        allow_null=True,
        max_length=None,
    )

    avatar = serializers.FileField(
        required=False,
        allow_null=True,
        max_length=None,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "date_joined",
            "sidebar_name",
            "sidebar_icon",
            "avatar",
            "mcp_enabled",
            "preferred_lang",
            "preferred_theme",
            "preferred_accent",
            "onboarding_completed",
        )
        read_only_fields = ("id", "email", "username", "date_joined")

    def validate_preferred_accent(self, value: str) -> str:
        # The model already validates with RegexValidator; we normalize to lowercase
        # so cookie, DB and front-end comparisons match.
        return (value or "").strip().lower()

    def validate_sidebar_name(self, value: str) -> str:
        value = (value or "").strip()
        if len(value) > 60:
            raise serializers.ValidationError("Máximo 60 caracteres.")
        return value

    def _processed_image(self, value, max_bytes: int):
        """Validate, crop (`crop_x/y/w/h` from the same request) and downsize the image."""
        if value is None:
            return value
        return process_upload(
            value, crop_from_data(getattr(self, "initial_data", None)), max_bytes=max_bytes,
        )

    def validate_sidebar_icon(self, value):
        return self._processed_image(value, SIDEBAR_ICON_MAX_BYTES)

    def validate_avatar(self, value):
        return self._processed_image(value, AVATAR_MAX_BYTES)

    def update(self, instance, validated_data):
        # If a new sidebar_icon arrives and there was an old one, delete it from storage
        # before Django saves the new one. Django does NOT delete the old file
        # automatically when the field is overwritten.
        new_icon = validated_data.get("sidebar_icon")
        if new_icon and instance.sidebar_icon:
            instance.sidebar_icon.delete(save=False)

        # If the client sent `sidebar_icon=null` (or an empty string), delete it.
        # In multipart, empty fields usually arrive as the string "" —
        # we normalize to None so the field gets cleared.
        if "sidebar_icon" in validated_data and not validated_data["sidebar_icon"]:
            validated_data["sidebar_icon"] = None
            if instance.sidebar_icon:
                instance.sidebar_icon.delete(save=False)

        # Profile photo: same pattern. Replacing deletes the previous file;
        # `avatar=null` (JSON) or "" (multipart) removes it.
        new_avatar = validated_data.get("avatar")
        if new_avatar and instance.avatar:
            instance.avatar.delete(save=False)

        if "avatar" in validated_data and not validated_data["avatar"]:
            validated_data["avatar"] = None
            if instance.avatar:
                instance.avatar.delete(save=False)

        return super().update(instance, validated_data)


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer to create a new user (registration of the first account)."""

    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("email", "username", "password", "password_confirm", "first_name", "last_name")
        extra_kwargs = {
            "username": {"required": False, "validators": []},
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_email(self, value: str) -> str:
        email = (value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe una cuenta con ese correo.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Las contraseñas no coinciden."})
        # Validate against AUTH_PASSWORD_VALIDATORS with the user's data, so the
        # similarity rule with name/email also applies.
        candidate = User(
            email=attrs["email"],
            username=attrs.get("username") or "",
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            validate_password(attrs["password"], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        attrs["username"] = self._unique_username(attrs.get("username") or attrs["email"].split("@")[0])
        return attrs

    @staticmethod
    def _unique_username(base: str) -> str:
        """`username` is unique in AbstractUser: append a suffix if it is already taken."""
        base = (base or "user")[:140]
        candidate, n = base, 1
        while User.objects.filter(username__iexact=candidate).exists():
            n += 1
            candidate = f"{base}{n}"
        return candidate

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
