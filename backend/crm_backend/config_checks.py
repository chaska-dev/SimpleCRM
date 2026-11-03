"""
Startup validations (fail-closed) for production.

With DEBUG=False the process does NOT start if SECRET_KEY is missing, if it is an
example / too short value, or if there are no valid encryption keys. With DEBUG=True
(development) the only requirement is that the keys, if they exist, are valid when used.

Secret values are never included in error messages.
"""

from __future__ import annotations

from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured

# Example values found in .env.example / development settings.
INSECURE_SECRET_KEYS = frozenset(
    {
        "insecure-dev-key-change-me",
        "change-me-in-prod",
        "change-me",
        "changeme",
        "secret",
        "secret-key",
    }
)
INSECURE_PREFIXES = ("change-me", "changeme", "insecure", "django-insecure")
MIN_SECRET_KEY_LENGTH = 32

_GENERATE_SECRETS_HINT = "Generate them with: python scripts/generate-secrets.py"


def is_insecure_secret_key(secret_key: str) -> bool:
    value = (secret_key or "").strip()
    if not value:
        return True
    lowered = value.lower()
    return (
        lowered in INSECURE_SECRET_KEYS
        or lowered.startswith(INSECURE_PREFIXES)
        or len(value) < MIN_SECRET_KEY_LENGTH
    )


def validate_production_config(debug: bool, secret_key: str, encryption_keys) -> None:
    """Raise ImproperlyConfigured if the config is not fit for production."""
    if debug:
        return

    if is_insecure_secret_key(secret_key):
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY is missing, is an example value or has fewer than "
            f"{MIN_SECRET_KEY_LENGTH} characters, and DEBUG=False. {_GENERATE_SECRETS_HINT}"
        )

    keys = [k for k in (encryption_keys or []) if k]
    if not keys:
        raise ImproperlyConfigured(
            "FIELD_ENCRYPTION_KEYS (or FIELD_ENCRYPTION_KEY) is required with DEBUG=False. "
            + _GENERATE_SECRETS_HINT
        )
    for index, key in enumerate(keys, start=1):
        try:
            Fernet(key.encode("utf-8") if isinstance(key, str) else key)
        except (ValueError, TypeError) as exc:
            raise ImproperlyConfigured(
                f"Encryption key #{index} is not a valid Fernet key (url-safe base64 "
                f"of 32 bytes): {exc}"
            ) from exc
