"""
REST API for the MCP UI (Django session, like the rest of /api/).

Everything is owner-scoped. The plaintext token only appears in the creation POST
response and in `reveal/` (owner only, while the token is not revoked).
"""

from __future__ import annotations

import sys

from django.conf import settings
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from crm import services
from crm.services import ServiceError

from .auth import CREATION_TOOLS
from .models import AgentAction, ApiToken
from .serializers import (
    AgentActionSerializer,
    ApiTokenCreateSerializer,
    ApiTokenSerializer,
)

MAX_ACTIONS_LIMIT = 200


class TokenListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tokens = ApiToken.objects.filter(owner=request.user)
        return Response(ApiTokenSerializer(tokens, many=True).data)

    def post(self, request):
        ser = ApiTokenCreateSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        token, raw = ApiToken.create_for(
            request.user, ser.validated_data["name"], ser.validated_data["scopes"],
            ser.validated_data.get("expires_at"),
        )
        data = ApiTokenSerializer(token).data
        data["token"] = raw  # the only time it is shown
        return Response(data, status=status.HTTP_201_CREATED)


class TokenRevealView(APIView):
    """Return the full token (stored encrypted) to its owner only. 404 if not applicable."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        token = get_object_or_404(ApiToken, pk=pk, owner=request.user)
        if not token.can_reveal:  # revoked, token predating token_enc or not decryptable
            raise Http404
        response = Response({"token": str(token.token_enc)})
        response["Cache-Control"] = "no-store"
        return response


class TokenRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        token = get_object_or_404(ApiToken, pk=pk, owner=request.user)
        if token.revoked_at is None:
            token.revoked_at = timezone.now()
            token.save(update_fields=["revoked_at"])
        return Response(ApiTokenSerializer(token).data)


def _person_links(actions) -> dict[int, int]:
    """Map action_id -> person_id for objects that hang from a person."""
    from crm.models import ContactInfo, ImportantDate, Interaction, Note, PersonOrganization

    models_by_type = {
        "contact_info": ContactInfo, "important_date": ImportantDate,
        "note": Note, "interaction": Interaction, "membership": PersonOrganization,
    }
    links: dict[int, int] = {}
    for kind, model in models_by_type.items():
        rows = [a for a in actions if a.target_type == kind and a.target_id]
        if not rows:
            continue
        found = dict(
            model.objects.filter(
                pk__in=[a.target_id for a in rows], person__owner=actions[0].owner,
            ).values_list("pk", "person_id")
        )
        for a in rows:
            if a.target_id in found:
                links[a.pk] = found[a.target_id]
    return links


class ActionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", "50"))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, MAX_ACTIONS_LIMIT))
        qs = AgentAction.objects.filter(owner=request.user).select_related("token")
        tool = request.query_params.get("tool")
        if tool:
            qs = qs.filter(tool_name=tool)
        actions = list(qs[:limit])
        ctx = {"person_links": _person_links(actions) if actions else {}}
        return Response(AgentActionSerializer(actions, many=True, context=ctx).data)


class ActionUndoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        action = get_object_or_404(AgentAction, pk=pk, owner=request.user)
        if action.undone_at is not None:
            return Response({"detail": "La accion ya fue deshecha."},
                            status=status.HTTP_400_BAD_REQUEST)
        if (
            action.status != "ok"
            or action.tool_name not in CREATION_TOOLS
            or action.target_id is None
        ):
            return Response({"detail": "Solo se pueden deshacer creaciones."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            message = services.undo_creation(request.user, action.target_type, action.target_id)
        except ServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        action.undone_at = timezone.now()
        action.save(update_fields=["undone_at"])
        data = AgentActionSerializer(action).data
        data["detail"] = message
        return Response(data)


def public_mcp_url() -> str | None:
    """Public URL of the MCP endpoint configured via env (MCP_PUBLIC_URL), or None."""
    value = (getattr(settings, "MCP_PUBLIC_URL", "") or "").strip()
    return value or None


class ConfigView(APIView):
    """
    Data to build the client configuration.

    `public_url` is null if there is no MCP_PUBLIC_URL (the UI uses the browser origin).
    `stdio` (project paths) only for staff or with DEBUG: in a deployment those
    paths are not the user's and must not be exposed.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = {"public_url": public_mcp_url()}
        if request.user.is_staff or settings.DEBUG:
            base = settings.BASE_DIR
            data["stdio"] = {
                "project_dir": str(base),
                "python": sys.executable,
                "manage_py": str(base / "manage.py"),
            }
        return Response(data)


def mcp_wsgi_fallback(request):
    """/mcp/ under runserver (WSGI): explains how to serve the HTTP endpoint."""
    return JsonResponse(
        {
            "error": "El endpoint MCP HTTP requiere un servidor ASGI.",
            "how": "uvicorn crm_backend.asgi:application --host 127.0.0.1 --port 8010",
            "docs": "docs/architecture/mcp.md",
        },
        status=501,
    )
