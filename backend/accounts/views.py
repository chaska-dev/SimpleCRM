"""
Auth views:
- CsrfView: returns the CSRF token (needed for the frontend to make cross-origin POSTs).
- RegistrationStatusView: says whether /register/ is open (public).
- RegisterView: creates a new user (only the first account, or with ALLOW_REGISTRATION).
- MeView: returns (GET) / updates (PATCH) the current user.
- LoginView / LogoutView: DRF wrappers around Django's login/logout.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .cookies import LANG_COOKIE, set_pref_cookies
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()

REGISTRATION_CLOSED_MESSAGE = "El registro está cerrado. Pídele al administrador que te cree una cuenta."


def _allow_registration_env() -> bool:
    """`ALLOW_REGISTRATION` (setting or environment variable); False by default.

    Read on every call (not at import time) so it can be enabled in tests and
    not depend on `crm_backend/settings.py`.
    """
    value = getattr(settings, "ALLOW_REGISTRATION", None)
    if value is None:
        value = os.environ.get("ALLOW_REGISTRATION", "")
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def registration_status() -> dict:
    """`can_register` = there are no users yet, or ALLOW_REGISTRATION is enabled."""
    users_count = User.objects.count()
    return {
        "can_register": users_count == 0 or _allow_registration_env(),
        "users_count": users_count,
    }


def _initial_lang(request) -> str:
    """Initial language of a new account: preference cookie, then Accept-Language."""
    cookie = request.COOKIES.get(LANG_COOKIE)
    if cookie in ("es", "en"):
        return cookie
    header = (request.META.get("HTTP_ACCEPT_LANGUAGE") or "").strip().lower()
    return "en" if header.startswith("en") else "es"


class CsrfView(APIView):
    """Return the CSRF token. Sets the csrftoken cookie."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


class RegistrationStatusView(APIView):
    """Public: `{can_register, users_count}` for /register/ and /login/."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(registration_status())


# APIView is csrf_exempt and SessionAuthentication only enforces CSRF on already
# authenticated users: login and registration (anonymous) enforce it here to avoid "login CSRF".
@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    """Create a user and log them in automatically.

    Only allowed if there are no users or if ALLOW_REGISTRATION is enabled (403 otherwise).
    The new account gets pending onboarding, dark theme, default accent and
    language taken from the cookie or the request's Accept-Language.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not registration_status()["can_register"]:
            return Response(
                {"detail": REGISTRATION_CLOSED_MESSAGE},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(
            preferred_lang=_initial_lang(request),
            preferred_theme="dark",
            preferred_accent="#db2777",
            onboarding_completed=False,
        )
        login(request, user)
        response = Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        set_pref_cookies(response, user)
        return response


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    """Email + password → Django session (httpOnly sessionid cookie)."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        data = request.data
        email = data.get("email") if isinstance(data, dict) else None
        password = data.get("password") if isinstance(data, dict) else None
        if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
            return Response(
                {"detail": "email y password son requeridos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        email = email.strip().lower()
        user = authenticate(request, username=email, password=password)
        if user is None:
            # Accounts stored with uppercase letters: look up the email case-insensitively.
            stored = User.objects.filter(email__iexact=email).values_list("email", flat=True).first()
            if stored is not None and stored != email:
                user = authenticate(request, username=stored, password=password)
        if user is None:
            return Response(
                {"detail": "Credenciales inválidas."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        response = Response(UserSerializer(user).data)
        set_pref_cookies(response, user)
        return response


class LogoutView(APIView):
    """Close the current session."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET → returns the user. PATCH → updates allowed fields.

    Both methods rewrite the preference cookies (language, theme,
    accent) so the SSR always sees the user's current value.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        response = Response(UserSerializer(request.user).data)
        set_pref_cookies(response, request.user)
        return response

    def patch(self, request):
        # partial=True allows PATCH with a single field (e.g. only sidebar_name).
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response = Response(serializer.data)
        set_pref_cookies(response, user)
        return response
