"""
Authentication, rate limiting and action logging for MCP access.

Security:
- Only sha256(token) is stored. Lookup is by `prefix` (non-secret data) and
  the hash is compared with `hmac.compare_digest` (constant time).
- Rejected: unknown, revoked or expired token (401); user with
  `mcp_enabled=False` or inactive (403).
- Limit of 60 calls/min per token (Django cache, per process).
"""

from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.core.cache import cache
from django.db import close_old_connections, connection
from django.utils import timezone

from .models import TOKEN_PREFIX, AgentAction, ApiToken, hash_token

RATE_LIMIT_PER_MINUTE = 60
LAST_USED_REFRESH_SECONDS = 60

# Tools that CREATE an object: only those can be undone.
CREATION_TOOLS = frozenset({
    "create_person", "add_contact_info", "add_birthday", "add_important_date",
    "add_note", "log_interaction", "create_reminder", "schedule_meeting",
    "create_organization", "add_person_to_organization",
})

# Keys whose content is sensitive text (encrypted in the CRM DB): the
# action history stores only its length, never the content.
SENSITIVE_KEYS = frozenset({"body", "message", "how_we_met", "notes"})
ARG_TEXT_LIMIT = 200
ARG_LIST_LIMIT = 20


def cleanup_connections() -> None:
    """
    Close stale connections (MCP does not go through the Django request/response
    cycle that normally does this). No-op inside a transaction (tests).
    """
    if not connection.in_atomic_block:
        close_old_connections()


class AuthError(Exception):
    """Authentication/authorization failure. `status` is the suggested HTTP code."""

    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


class RateLimitError(Exception):
    pass


@dataclass(frozen=True)
class Principal:
    user: Any
    token: ApiToken

    def require_scope(self, scope: str) -> None:
        if not self.token.has_scope(scope):
            raise AuthError(f"El token no tiene el scope '{scope}'.", status=403)


def authenticate(raw: str | None) -> Principal:
    """Validate a plaintext token and return the Principal (user + token)."""
    raw = (raw or "").strip()
    computed = hash_token(raw)  # always computed (uniform timing)
    if not raw.startswith(TOKEN_PREFIX) or len(raw) < 12:
        raise AuthError("Token invalido.")
    found = None
    for candidate in ApiToken.objects.select_related("owner").filter(prefix=raw[:8]):
        if hmac.compare_digest(candidate.token_hash, computed):
            found = candidate
    if found is None:
        raise AuthError("Token invalido.")
    if found.is_revoked or found.is_expired:
        raise AuthError("Token revocado o vencido.")
    user = found.owner
    if not user.is_active or not user.mcp_enabled:
        raise AuthError("El acceso MCP esta desactivado para este usuario.", status=403)
    now = timezone.now()
    if found.last_used_at is None or (now - found.last_used_at) > timedelta(
        seconds=LAST_USED_REFRESH_SECONDS
    ):
        ApiToken.objects.filter(pk=found.pk).update(last_used_at=now)
    return Principal(user=user, token=found)


def check_rate_limit(token: ApiToken, limit: int = RATE_LIMIT_PER_MINUTE) -> None:
    """Fixed 1-minute window per token. Raises RateLimitError when exceeded."""
    bucket = int(timezone.now().timestamp() // 60)
    key = f"crm_mcp:rl:{token.pk}:{bucket}"
    if cache.add(key, 1, timeout=90):
        return
    try:
        count = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.add(key, 1, timeout=90)
        return
    if count > limit:
        raise RateLimitError(f"Limite de {limit} llamadas por minuto excedido.")


# ---------------------------------------------------------------------------
# Action logging
# ---------------------------------------------------------------------------


def _clip(value: Any, depth: int = 0) -> Any:
    if isinstance(value, str):
        return value if len(value) <= ARG_TEXT_LIMIT else value[:ARG_TEXT_LIMIT] + "..."
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if depth >= 2:
        return "[omitido]"
    if isinstance(value, (list, tuple)):
        return [_clip(v, depth + 1) for v in list(value)[:ARG_LIST_LIMIT]]
    if isinstance(value, dict):
        return {str(k)[:60]: _clip(v, depth + 1) for k, v in list(value.items())[:ARG_LIST_LIMIT]}
    return _clip(str(value), depth)


def sanitize_arguments(arguments: dict[str, Any]) -> dict[str, Any]:
    """Truncate texts to 200 chars and replace the content of sensitive fields with their length."""
    out: dict[str, Any] = {}
    for key, value in list((arguments or {}).items())[:ARG_LIST_LIMIT]:
        if key in SENSITIVE_KEYS and isinstance(value, str):
            out[key] = f"[{len(value)} caracteres]" if value else ""
        else:
            out[key] = _clip(value)
    return out


def record_action(
    principal: Principal, tool_name: str, arguments: dict[str, Any], *,
    status: str = "ok", target_type: str = "", target_id: int | None = None,
    error_message: str = "",
) -> AgentAction:
    return AgentAction.objects.create(
        owner=principal.user, token=principal.token, tool_name=tool_name,
        arguments=sanitize_arguments(arguments), status=status,
        target_type=target_type, target_id=target_id,
        error_message=(error_message or "")[:500],
    )
