"""
Mounting of the MCP (Streamable HTTP) inside Django's ASGI.

`MCPRouter` wraps Django's ASGI app:
- lifespan scope  -> the SDK's Starlette app (starts/stops the session manager).
- http /mcp, /mcp/ -> `BearerAuth` (authenticates the Authorization header) and then
  the SDK app. The principal is left in `scope["crm_principal"]`.
- everything else -> Django.

runserver is WSGI and does not serve this endpoint: use uvicorn (see docs/architecture/mcp.md).
"""

import json

from asgiref.sync import sync_to_async

from .auth import AuthError, authenticate, cleanup_connections

MCP_PATHS = ("/mcp", "/mcp/")


def _authenticate_sync(raw: str):
    cleanup_connections()
    try:
        return authenticate(raw)
    finally:
        cleanup_connections()


def _bearer(headers) -> str | None:
    for key, value in headers:
        if key == b"authorization":
            text = value.decode("latin-1")
            scheme, _, token = text.partition(" ")
            if scheme.lower() == "bearer" and token.strip():
                return token.strip()
    return None


async def _send_json(send, status: int, payload: dict, extra_headers=()) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
        *extra_headers,
    ]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class BearerAuth:
    """Authenticate each HTTP request with `Authorization: Bearer <token>`."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        raw = _bearer(scope.get("headers", []))
        if raw is None:
            await _send_json(
                send, 401, {"error": "Falta el header Authorization: Bearer <token>."},
                [(b"www-authenticate", b"Bearer")],
            )
            return
        try:
            principal = await sync_to_async(_authenticate_sync)(raw)
        except AuthError as exc:
            extra = [(b"www-authenticate", b"Bearer")] if exc.status == 401 else []
            await _send_json(send, exc.status, {"error": str(exc)}, extra)
            return
        scope["crm_principal"] = principal
        await self.app(scope, receive, send)


class MCPRouter:
    def __init__(self, django_app):
        from .server import mcp

        self.django_app = django_app
        self.mcp_app = mcp.streamable_http_app()  # Starlette with the session manager's lifespan
        self.protected = BearerAuth(self.mcp_app)

    async def __call__(self, scope, receive, send):
        kind = scope["type"]
        if kind == "lifespan":
            await self.mcp_app(scope, receive, send)
        elif kind == "http" and scope["path"] in MCP_PATHS:
            scope = dict(scope)
            scope["path"] = "/mcp"
            scope["raw_path"] = b"/mcp"
            await self.protected(scope, receive, send)
        else:
            await self.django_app(scope, receive, send)
