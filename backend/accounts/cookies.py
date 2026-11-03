"""
Interface preference cookies.

The backend is the source of truth (`User` fields); these cookies are a
mirror readable by the Astro SSR and by the anti-flicker script. They are not
httpOnly on purpose: the frontend also writes them when changing language/theme.
"""

from __future__ import annotations

from django.conf import settings

# Cookie names (read by frontend/src/lib/auth-server.ts and NoFOUC.astro).
LANG_COOKIE = "preferred_lang"
THEME_COOKIE = "preferred_theme"
ACCENT_COOKIE = "preferred_accent"

# 1 year.
PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def set_pref_cookies(response, user) -> None:
    """Write the language, theme and accent cookies with the user's values."""
    secure = bool(getattr(settings, "SESSION_COOKIE_SECURE", False))
    values = {
        LANG_COOKIE: user.preferred_lang,
        THEME_COOKIE: user.preferred_theme,
        ACCENT_COOKIE: user.preferred_accent,
    }
    for name, value in values.items():
        response.set_cookie(
            name,
            value,
            max_age=PREF_COOKIE_MAX_AGE,
            path="/",
            samesite="Lax",
            httponly=False,
            secure=secure,
        )
