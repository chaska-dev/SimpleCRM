"""
MCP access models.

- ApiToken: access token for agents. Authentication uses only the sha256
  hash; in addition the full token is stored encrypted (`token_enc`, like
  notes) so it can be shown again in Settings > Integrations.
- AgentAction: history of an agent's write calls (audit and
  undoing creations).
"""

from __future__ import annotations

import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from crm.fields import EncryptedTextField, UndecryptableValue

TOKEN_PREFIX = "crm_"
VALID_SCOPES = ("read", "write")


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_raw_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


class ApiToken(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mcp_tokens",
    )
    name = models.CharField(max_length=80)
    token_hash = models.CharField(max_length=64, unique=True, editable=False)
    prefix = models.CharField(max_length=8, db_index=True, editable=False)
    scopes = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    # Full token encrypted (Fernet). Empty for tokens created before this column:
    # those can no longer be revealed. NOT used to authenticate (that is token_hash).
    token_enc = EncryptedTextField(blank=True, default="", editable=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.name} ({self.prefix}...)"

    @classmethod
    def create_for(cls, owner, name: str, scopes: list[str] | None = None,
                   expires_at=None) -> tuple["ApiToken", str]:
        """Create the token and return (object, plaintext_token). The plaintext is stored encrypted."""
        raw = generate_raw_token()
        clean = [s for s in (scopes or ["read", "write"]) if s in VALID_SCOPES]
        obj = cls.objects.create(
            owner=owner, name=name, token_hash=hash_token(raw), prefix=raw[:8],
            scopes=sorted(set(clean)), expires_at=expires_at, token_enc=raw,
        )
        return obj, raw

    @property
    def can_reveal(self) -> bool:
        """True if the full token can be shown (not revoked, stored and decryptable)."""
        value = self.token_enc
        return (
            not self.is_revoked
            and bool(value)
            and not isinstance(value, UndecryptableValue)
        )

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= timezone.now()

    @property
    def is_active(self) -> bool:
        return not self.is_revoked and not self.is_expired

    def has_scope(self, scope: str) -> bool:
        return scope in (self.scopes or [])


class AgentAction(models.Model):
    STATUS_CHOICES = [("ok", "OK"), ("error", "Error")]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="agent_actions",
    )
    token = models.ForeignKey(
        ApiToken, on_delete=models.SET_NULL, null=True, blank=True, related_name="actions",
    )
    tool_name = models.CharField(max_length=80)
    arguments = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default="ok")
    target_type = models.CharField(max_length=30, blank=True, default="")
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    error_message = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    undone_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["owner", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.tool_name} [{self.status}] #{self.pk}"
