"""
Attachment ViewSet — nested over any model (GenericForeignKey).

Routes:
- GET    /api/attachments/?subject_type=person&subject_id=42      → list (also accepts crm.person)
- GET    /api/attachments/{id}/                                  → retrieve
- POST   /api/attachments/                                        → upload (multipart)
- PATCH  /api/attachments/{id}/                                   → edit title/description
- DELETE /api/attachments/{id}/                                   → delete + remove from disk
- GET    /api/attachments/{id}/download/                          → decrypted stream
- GET    /api/attachments/{id}/thumb/?w=200                      → thumbnail (images)

All actions are owner-scoped.
"""

from __future__ import annotations

import io
from urllib.parse import quote

from django.contrib.contenttypes.models import ContentType
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import Attachment
from .serializers import AttachmentSerializer


THUMB_DEFAULT_WIDTH = 200
THUMB_MIN_WIDTH = 16
THUMB_MAX_WIDTH = 1024
THUMB_MAX_PIXELS = 40_000_000


class IsAttachmentOwner(permissions.BasePermission):
    """The attachment must belong to request.user."""

    def has_object_permission(self, request, view, obj: Attachment) -> bool:
        return obj.owner == request.user


class AttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = AttachmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsAttachmentOwner]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Attachment.objects.filter(owner=self.request.user).select_related("owner", "subject_type")
        # Optional filters by query params
        ctype = self.request.query_params.get("subject_type")
        sid = self.request.query_params.get("subject_id")
        if sid:
            try:
                sid = int(sid)
            except ValueError:
                raise ValidationError({"subject_id": "Debe ser un número entero."})
        if ctype:
            # Accepts "person" or "crm.person".
            qs = qs.filter(subject_type__model=ctype.rsplit(".", 1)[-1].lower())
        if ctype and sid:
            qs = qs.filter(subject_id=sid)
        if self.action == "list":
            # A person's profile photo is an Attachment, but it is not listed as an attachment.
            from crm.models import Person

            qs = qs.exclude(
                pk__in=Person.objects.filter(
                    owner=self.request.user, profile_photo__isnull=False,
                ).values("profile_photo_id"),
            )
        return qs

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("No puedes borrar attachments de otro usuario.")
        # Delete the encrypted file from storage before deleting the row.
        if instance.file:
            try:
                instance.file.delete(save=False)
            except Exception:
                pass
        instance.delete()

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        """
        Return the file in plaintext (decrypted on the fly).
        Streaming via FileResponse; the storage decrypts in `_open`.
        """
        attachment = self.get_object()
        if attachment.owner != request.user:
            raise PermissionDenied("No autorizado.")

        # `attachment.file.open()` triggers _open of EncryptedFileSystemStorage,
        # which decrypts the content and returns a plaintext ContentFile.
        plaintext_file = attachment.file.open("rb")
        response = FileResponse(
            plaintext_file,
            as_attachment=True,
            filename=attachment.original_filename or attachment.title or f"attachment-{attachment.id}",
        )
        quoted = quote(attachment.original_filename or "download")
        response["Content-Disposition"] = (
            f'attachment; filename="{quoted}"; '
            f"filename*=UTF-8''{quoted}"
        )
        if attachment.mime_type:
            response["Content-Type"] = attachment.mime_type
        return response

    @action(detail=True, methods=["get"], url_path="thumb")
    def thumb(self, request, pk=None):
        """
        Generate an on-demand thumbnail for images.
        Parameters: ?w=<width> (default 200, between 16 and 1024).
        ?anim=1 returns the file as is if it is an animated GIF/WEBP (photos are already
        downsized to 512 px when uploaded); otherwise, a static PNG.
        """
        attachment = self.get_object()
        if attachment.owner != request.user:
            raise PermissionDenied("No autorizado.")

        if not attachment.mime_type.startswith("image/"):
            return Response(
                {"detail": "Thumbnails solo disponibles para imágenes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            width = int(request.query_params.get("w", "200"))
        except (TypeError, ValueError):
            width = THUMB_DEFAULT_WIDTH
        width = max(THUMB_MIN_WIDTH, min(width, THUMB_MAX_WIDTH))

        from PIL import Image

        try:
            with attachment.file.open("rb") as fh:
                plaintext = fh.read()
        except FileNotFoundError:
            return Response({"detail": "Archivo no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        try:
            with Image.open(io.BytesIO(plaintext)) as img:
                # Own pixel cap (Image.MAX_IMAGE_PIXELS is not touched, since it is global).
                if img.width * img.height > THUMB_MAX_PIXELS:
                    raise ValueError("image too large")
                if (
                    request.query_params.get("anim") == "1"
                    and img.format in ("GIF", "WEBP")
                    and getattr(img, "n_frames", 1) > 1
                ):
                    return HttpResponse(plaintext, content_type=Image.MIME[img.format])
                img.thumbnail((width, width * 4))
                # PNG stores RGB/RGBA; other modes (P, CMYK, I;16...) are converted.
                if img.mode not in ("RGB", "RGBA"):
                    has_alpha = img.mode in ("LA", "PA") or "transparency" in img.info
                    img = img.convert("RGBA" if has_alpha else "RGB")
                buf = io.BytesIO()
                img.save(buf, format="PNG", optimize=True)
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
            return Response(
                {"detail": "No se pudo generar la miniatura de esta imagen."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        return HttpResponse(buf.getvalue(), content_type="image/png")
