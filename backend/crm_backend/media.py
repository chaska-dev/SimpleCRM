"""
Protected view for /media/.

/media/ is no longer public. It requires a session and only serves the user's own files:

    sidebar_icons/user_<id>.<ext>   only if <id> is the session user
    avatars/user_<id>.<ext>         only if <id> is the session user
    org_logos/org_<id>.<ext>        only if Organization <id> belongs to the user
    important_dates/<file>          only if one of the user's ImportantDates references it
                                    (legacy icon_image field)

Everything else (attachments/, paths with "..", absolute paths, symlinks that escape
MEDIA_ROOT, files that belong to others or do not exist) answers 404; without a session,
401. "Belongs to others" is not distinguished from "does not exist" so as not to leak which
ids exist. Encrypted attachments are NOT served from here: only through
/api/attachments/{id}/download|thumb/.

Works the same with runserver and with uvicorn/Docker (independent of DEBUG and nginx).
"""

from __future__ import annotations

import mimetypes
import os
import posixpath
import re

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.utils.cache import get_conditional_response
from django.utils.http import http_date, quote_etag
from django.views.decorators.http import require_GET

_IMAGE_EXT = r"(?:png|jpe?g|webp|gif)"
_USER_ICON = re.compile(rf"^sidebar_icons/user_(?P<id>\d+)\.{_IMAGE_EXT}$", re.IGNORECASE)
_USER_AVATAR = re.compile(rf"^avatars/user_(?P<id>\d+)\.{_IMAGE_EXT}$", re.IGNORECASE)
_ORG_LOGO = re.compile(rf"^org_logos/org_(?P<id>\d+)\.{_IMAGE_EXT}$", re.IGNORECASE)
_DATE_ICON = re.compile(r"^important_dates/[\w.\- ]+$")

# Only known image types are served (never html/svg/js from media).
_ALLOWED_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _normalize(path: str) -> str | None:
    """Canonical relative path, or None if it is suspicious."""
    if not path or "\x00" in path or "\\" in path or path.startswith("/"):
        return None
    normalized = posixpath.normpath(path)
    if normalized != path or normalized.startswith(("../", "..")) or "/../" in normalized:
        return None
    return normalized


def _is_owned(user, rel: str) -> bool:
    """True if the relative path belongs to the user according to the rules above."""
    match = _USER_ICON.match(rel) or _USER_AVATAR.match(rel)
    if match:
        return int(match.group("id")) == user.pk

    match = _ORG_LOGO.match(rel)
    if match:
        from crm.models import Organization

        return Organization.objects.filter(pk=int(match.group("id")), owner=user).exists()

    if _DATE_ICON.match(rel):
        from crm.models import ImportantDate

        return ImportantDate.objects.filter(person__owner=user, icon_image=rel).exists()

    return False


def _resolve_file(rel: str) -> str | None:
    """Absolute path inside MEDIA_ROOT (resolving symlinks), or None."""
    root = os.path.realpath(str(settings.MEDIA_ROOT))
    full = os.path.realpath(os.path.join(root, *rel.split("/")))
    if os.path.commonpath([root, full]) != root or not os.path.isfile(full):
        return None
    return full


@require_GET
def protected_media(request, path: str):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        response = HttpResponse("Autenticación requerida.", status=401, content_type="text/plain")
        response["Cache-Control"] = "private, no-store"
        return response

    rel = _normalize(path)
    if rel is None or not _is_owned(user, rel):
        raise Http404("No encontrado.")

    full = _resolve_file(rel)
    if full is None:
        raise Http404("No encontrado.")

    ext = os.path.splitext(full)[1].lower()
    content_type = _ALLOWED_CONTENT_TYPES.get(ext) or mimetypes.guess_type(full)[0]
    if content_type not in _ALLOWED_CONTENT_TYPES.values():
        raise Http404("No encontrado.")

    stat = os.stat(full)
    etag = quote_etag(f"{int(stat.st_mtime)}-{stat.st_size}")
    last_modified = int(stat.st_mtime)

    not_modified = get_conditional_response(request, etag=etag, last_modified=last_modified)
    if not_modified is not None:
        not_modified["Cache-Control"] = "private, no-cache"
        not_modified["Vary"] = "Cookie"
        return not_modified

    response = FileResponse(open(full, "rb"), content_type=content_type)
    response["Cache-Control"] = "private, no-cache"  # cacheable only by the browser, always revalidated
    response["Vary"] = "Cookie"
    response["ETag"] = etag
    response["Last-Modified"] = http_date(last_modified)
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = "inline"
    return response
