"""URL configuration for crm_backend."""

from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.decorators.http import require_GET
from django.views.static import serve as serve_static

from crm_mcp.views import mcp_wsgi_fallback

from .media import protected_media


@require_GET
def healthcheck(request):
    """Simple endpoint to verify that the backend is alive."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", healthcheck, name="healthcheck"),
    path("api/auth/", include("accounts.urls")),
    path("api/mcp/", include("crm_mcp.urls")),
    path("api/", include("crm.urls")),
    path("api/attachments/", include("crm_attachment.urls")),
    # Under runserver (WSGI) it answers 501 with instructions; under uvicorn crm_mcp.asgi handles it.
    path("mcp/", mcp_wsgi_fallback, name="mcp-wsgi-fallback"),
]

# /media/ is NEVER public: protected view (session + own files only), both in dev
# (runserver) and in Docker. Encrypted attachments are served only through /api/attachments/.
urlpatterns += [
    path("media/<path:path>", protected_media, name="protected-media"),
]

# Static files (Django admin). Behind Caddy they arrive here via /static/*; they are
# Django's own public files (admin CSS/JS), with no user data.
urlpatterns += [
    re_path(
        r"^static/(?P<path>.*)$",
        serve_static,
        {"document_root": settings.STATIC_ROOT},
        name="static-files",
    ),
]
