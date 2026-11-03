"""
ASGI config for crm_backend.

Serves Django and, at /mcp/, the MCP server (Streamable HTTP). Run with:
    uvicorn crm_backend.asgi:application --host 127.0.0.1 --port 8010
(`manage.py runserver` is WSGI: it does not serve /mcp/). See docs/architecture/mcp.md.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "crm_backend.settings")

django_asgi_app = get_asgi_application()

# Import after get_asgi_application(): it has already run django.setup().
from crm_mcp.asgi import MCPRouter  # noqa: E402

application = MCPRouter(django_asgi_app)
