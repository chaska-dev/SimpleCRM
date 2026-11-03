"""
Login attempt limit.

Middleware over POST /api/auth/login/: counts FAILED attempts (HTTP 401) per
IP + email and per IP alone, using Django's cache (fixed window). On reaching the maximum
(default 5 per 15 minutes for IP + email) it answers 429 with `Retry-After` without
reaching the view, even if the submitted password is correct. A successful login clears
the IP + email counter.

Cache keys use a hash (no plain email or IP). The IP comes from
REMOTE_ADDR (behind Caddy, uvicorn --proxy-headers replaces it with the real one).

The default cache is process memory: with several workers configure
CACHE_URL (e.g. filecache://) so the limit is shared.
"""

from __future__ import annotations

import hashlib
import json
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

LOGIN_PATHS = ("/api/auth/login/",)
_MAX_BODY_TO_PARSE = 16 * 1024


def _client_ip(request) -> str:
    return request.META.get("REMOTE_ADDR") or "unknown"


def _extract_email(request) -> str:
    """Normalized email of the attempt, or "" if it cannot be read."""
    try:
        length = int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        return ""
    if length > _MAX_BODY_TO_PARSE:
        return ""
    content_type = (request.META.get("CONTENT_TYPE") or "").lower()
    try:
        if content_type.startswith("application/json"):
            data = json.loads(request.body or b"{}")
            value = data.get("email") if isinstance(data, dict) else ""
        else:
            value = request.POST.get("email", "")
    except (ValueError, UnicodeDecodeError):
        return ""
    return str(value or "").strip().lower()[:254]


def _key(kind: str, *parts: str) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:32]
    return f"crm:login-rl:{kind}:{digest}"


class _Bucket:
    """Fixed-window counter: the counter and its expiry live in the cache."""

    def __init__(self, key: str, limit: int, window: int):
        self.key = key
        self.ts_key = key + ":until"
        self.limit = limit
        self.window = window

    def count(self) -> int:
        return int(cache.get(self.key, 0) or 0)

    def blocked(self) -> bool:
        return self.limit > 0 and self.count() >= self.limit

    def retry_after(self) -> int:
        until = cache.get(self.ts_key)
        if until is None:
            return self.window
        return max(1, int(until - time.time()))

    def hit(self) -> None:
        if cache.add(self.key, 1, timeout=self.window):
            cache.set(self.ts_key, time.time() + self.window, timeout=self.window)
            return
        try:
            cache.incr(self.key)
        except ValueError:  # expired between add and incr
            cache.add(self.key, 1, timeout=self.window)
            cache.set(self.ts_key, time.time() + self.window, timeout=self.window)

    def reset(self) -> None:
        cache.delete_many([self.key, self.ts_key])


class LoginRateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method != "POST" or request.path not in LOGIN_PATHS:
            return self.get_response(request)

        window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
        ip = _client_ip(request)
        email = _extract_email(request)
        pair = _Bucket(_key("pair", ip, email), settings.LOGIN_RATE_LIMIT_ATTEMPTS, window)
        per_ip = _Bucket(_key("ip", ip), settings.LOGIN_RATE_LIMIT_IP_ATTEMPTS, window)

        for bucket in (pair, per_ip):
            if bucket.blocked():
                retry = bucket.retry_after()
                response = JsonResponse(
                    {
                        "detail": "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
                        "code": "too_many_attempts",
                        "retry_after": retry,
                    },
                    status=429,
                )
                response["Retry-After"] = str(retry)
                return response

        response = self.get_response(request)

        if response.status_code == 401:
            pair.hit()
            per_ip.hit()
        elif 200 <= response.status_code < 300:
            pair.reset()
        return response
