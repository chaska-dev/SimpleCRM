"""
Custom User model: email-based auth (no username).

Login with email + password. Username remains as an optional legacy field
for compatibility with AbstractUser.

Sidebar customization:
- `sidebar_name`: custom name shown in the sidebar. If empty, the front end uses
  the i18n key `shell.app_name` ("Simple CRM").
- `sidebar_icon`: optional image that replaces the text brand in the
  sidebar. Lives in MEDIA_ROOT/sidebar_icons/.

Profile photo:
- `avatar`: optional user photo (topbar and Settings). Lives in
  MEDIA_ROOT/avatars/.

Interface preferences (source of truth in the DB; the frontend mirrors them
in cookies so the SSR renders language, theme and accent without flicker):
- `preferred_lang`: `es` | `en`.
- `preferred_theme`: `dark` | `light` (dark by default).
- `preferred_accent`: accent color `#rrggbb`.
- `onboarding_completed`: false until the user finishes (or skips) /welcome/.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.core.validators import FileExtensionValidator, RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


def sidebar_icon_upload_to(instance: "User", filename: str) -> str:
    """Stable path: media/sidebar_icons/user_<id>.<ext>.

    A single file per user — overwriting in the serializer deletes the
    previous one.
    """
    ext = (filename.rsplit(".", 1)[-1] or "png").lower()
    return f"sidebar_icons/user_{instance.pk}.{ext}"


def avatar_upload_to(instance: "User", filename: str) -> str:
    """Stable path: media/avatars/user_<id>.<ext>.

    A single file per user — replacing it in the serializer deletes the
    previous one.
    """
    ext = (filename.rsplit(".", 1)[-1] or "png").lower()
    return f"avatars/user_{instance.pk}.{ext}"


HEX_COLOR_REGEX = r"^#[0-9a-fA-F]{6}$"
DEFAULT_ACCENT = "#db2777"


class User(AbstractUser):
    LANG_CHOICES = [("es", "Español"), ("en", "English")]
    THEME_CHOICES = [("dark", "Dark"), ("light", "Light")]

    email = models.EmailField(_("email address"), unique=True)

    # Sidebar customization
    sidebar_name = models.CharField(
        _("sidebar name"),
        max_length=60,
        blank=True,
        default="",
        help_text=_(
            "Nombre que se muestra en la barra lateral. Vacío = usa el default de la app."
        ),
    )
    sidebar_icon = models.ImageField(
        _("sidebar icon"),
        upload_to=sidebar_icon_upload_to,
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["png", "jpg", "jpeg", "webp", "gif"]),
        ],
        help_text=_("Ícono opcional para la barra lateral (png/jpg/webp/gif, máx 500KB)."),
    )

    # Profile photo
    avatar = models.ImageField(
        _("avatar"),
        upload_to=avatar_upload_to,
        blank=True,
        null=True,
        validators=[
            FileExtensionValidator(allowed_extensions=["png", "jpg", "jpeg", "webp", "gif"]),
        ],
        help_text=_("Foto de perfil opcional (png/jpg/webp/gif, máx 2MB)."),
    )

    # AI agent access via MCP (opt-in, off by default).
    mcp_enabled = models.BooleanField(
        _("MCP enabled"),
        default=False,
        help_text=_("Permite que agentes de IA accedan al CRM con un token MCP."),
    )

    # Interface preferences
    preferred_lang = models.CharField(
        _("preferred language"),
        max_length=5,
        choices=LANG_CHOICES,
        default="es",
    )
    preferred_theme = models.CharField(
        _("preferred theme"),
        max_length=5,
        choices=THEME_CHOICES,
        default="dark",
    )
    preferred_accent = models.CharField(
        _("preferred accent"),
        max_length=7,
        default=DEFAULT_ACCENT,
        validators=[RegexValidator(HEX_COLOR_REGEX, "Usa un color #rrggbb.")],
    )
    onboarding_completed = models.BooleanField(
        _("onboarding completed"),
        default=False,
        help_text=_("Falso hasta que el usuario completa u omite la pantalla de bienvenida."),
    )

    # Make email the main identifier
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]  # for createsuperuser

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self) -> str:
        return self.email
