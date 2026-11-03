"""
Shared processing of uploaded images (spec v7 O).

`process_upload(file, crop, max_side=512)` is used by: user photo, brand
icon, institution logo and person photo.

- Validates with Pillow the REAL format (PNG, JPEG, WEBP, GIF), not the extension or the
  declared content-type, and a pixel limit.
- Applies the crop `(x, y, w, h)` in pixels of the original image (the one the client
  uploaded). Without a crop: centered square.
- Downsizes to at most `max_side` (never enlarges).
- Animated GIF and WEBP: crops and downsizes every frame keeping duration, loop and
  transparency (at most MAX_FRAMES frames; if there are more, 400).
- Returns a `SimpleUploadedFile` in the same format, named `upload.<ext>`.

Errors are `rest_framework.exceptions.ValidationError` (400) with messages in
Spanish; the frontend translates them in `utils/apiErrors.ts`.
"""

from __future__ import annotations

import io
from typing import Any

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

DEFAULT_MAX_SIDE = 512
DEFAULT_MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000  # per image / frame (width * height)
MAX_FRAMES = 300
MAX_ANIMATION_PIXELS = 500_000_000  # width * height * frames
CROP_TOLERANCE = 2  # px; the browser rounds the rectangle

# Pillow format -> (extension, content-type)
ALLOWED_FORMATS = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
    "GIF": ("gif", "image/gif"),
}

MSG_NOT_IMAGE = "El archivo no es una imagen PNG, JPG, WEBP o GIF."
MSG_UNREADABLE = "No se pudo leer la imagen."
MSG_PIXELS = "Las dimensiones de la imagen superan el límite permitido."
MSG_CROP_INVALID = "El recorte no es válido."
MSG_CROP_RANGE = "El recorte queda fuera de la imagen."
MSG_FRAMES = f"La imagen animada tiene demasiados cuadros (máximo {MAX_FRAMES})."

Crop = tuple[int, int, int, int]  # x, y, w, h


def _format_limit(max_bytes: int) -> str:
    mb = 1024 * 1024
    if max_bytes % mb == 0:
        return f"{max_bytes // mb} MB"
    return f"{max_bytes // 1024} KB"


def crop_from_data(data: Any) -> Crop | None:
    """Read `crop_x`, `crop_y`, `crop_w`, `crop_h` from a QueryDict/dict. None if absent."""
    if data is None or not hasattr(data, "get"):
        return None
    keys = ("crop_x", "crop_y", "crop_w", "crop_h")
    raw = [data.get(k) for k in keys]
    if all(v in (None, "") for v in raw):
        return None
    if any(v in (None, "") for v in raw):
        raise ValidationError(MSG_CROP_INVALID)
    try:
        values = [int(round(float(v))) for v in raw]
    except (TypeError, ValueError, OverflowError):
        raise ValidationError(MSG_CROP_INVALID)
    return values[0], values[1], values[2], values[3]


def _resolve_box(crop: Crop | None, width: int, height: int) -> tuple[int, int, int, int]:
    """PIL box (left, top, right, bottom) validated against the real size."""
    if crop is None:
        side = min(width, height)
        left, top = (width - side) // 2, (height - side) // 2
        return left, top, left + side, top + side
    x, y, w, h = crop
    if w <= 0 or h <= 0:
        raise ValidationError(MSG_CROP_INVALID)
    if x < -CROP_TOLERANCE or y < -CROP_TOLERANCE:
        raise ValidationError(MSG_CROP_RANGE)
    if x + w > width + CROP_TOLERANCE or y + h > height + CROP_TOLERANCE:
        raise ValidationError(MSG_CROP_RANGE)
    left, top = max(0, x), max(0, y)
    right, bottom = min(width, x + w), min(height, y + h)
    if right - left < 1 or bottom - top < 1:
        raise ValidationError(MSG_CROP_RANGE)
    return left, top, right, bottom


def _fit(im: Image.Image, max_side: int) -> Image.Image:
    if max(im.size) > max_side:
        im = im.copy()
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return im


def _has_alpha(im: Image.Image) -> bool:
    return im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info


def _save_static(im: Image.Image, fmt: str) -> bytes:
    buf = io.BytesIO()
    if fmt == "JPEG":
        im.convert("RGB").save(buf, format="JPEG", quality=90, optimize=True)
    elif fmt == "PNG":
        im = im.convert("RGBA" if _has_alpha(im) else "RGB")
        im.save(buf, format="PNG", optimize=True)
    else:  # WEBP
        im = im.convert("RGBA" if _has_alpha(im) else "RGB")
        im.save(buf, format="WEBP", quality=90, method=4)
    return buf.getvalue()


def _save_animated(frames: list[Image.Image], durations: list[int], loop: int | None, fmt: str) -> bytes:
    buf = io.BytesIO()
    extra: dict[str, Any] = {}
    if loop is not None:
        extra["loop"] = loop
    if fmt == "GIF":
        frames[0].save(
            buf, format="GIF", save_all=True, append_images=frames[1:],
            duration=durations, disposal=2, optimize=False, **extra,
        )
    else:  # WEBP
        frames[0].save(
            buf, format="WEBP", save_all=True, append_images=frames[1:],
            duration=durations, quality=85, method=4, **extra,
        )
    return buf.getvalue()


def process_upload(
    file,
    crop: Crop | None = None,
    max_side: int = DEFAULT_MAX_SIDE,
    max_bytes: int | None = DEFAULT_MAX_BYTES,
) -> SimpleUploadedFile:
    """Validate, crop and downsize an uploaded image. See the module docstring."""
    size = getattr(file, "size", None)
    if max_bytes is not None and size is not None and size > max_bytes:
        raise ValidationError(
            f"Imagen demasiado grande ({max(1, size // 1024)} KB). Máximo {_format_limit(max_bytes)}."
        )

    try:
        file.seek(0)
    except (AttributeError, OSError):
        pass
    data = file.read()
    if not data:
        raise ValidationError(MSG_NOT_IMAGE)

    try:
        img = Image.open(io.BytesIO(data))
    except UnidentifiedImageError:
        raise ValidationError(MSG_NOT_IMAGE)
    except Image.DecompressionBombError:
        raise ValidationError(MSG_PIXELS)
    except (OSError, SyntaxError, ValueError):
        raise ValidationError(MSG_UNREADABLE)

    fmt = img.format or ""
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError(MSG_NOT_IMAGE)
    ext, content_type = ALLOWED_FORMATS[fmt]

    width, height = img.size
    if width < 1 or height < 1 or width * height > MAX_PIXELS:
        raise ValidationError(MSG_PIXELS)

    n_frames = getattr(img, "n_frames", 1)
    animated = fmt in ("GIF", "WEBP") and n_frames > 1

    try:
        if animated or fmt == "GIF":
            box = _resolve_box(crop, width, height)
            if n_frames > MAX_FRAMES:
                raise ValidationError(MSG_FRAMES)
            if width * height * n_frames > MAX_ANIMATION_PIXELS:
                raise ValidationError(MSG_PIXELS)
            default_duration = int(img.info.get("duration") or 100)
            loop = img.info.get("loop")
            frames: list[Image.Image] = []
            durations: list[int] = []
            for frame in ImageSequence.Iterator(img):
                cropped = frame.convert("RGBA").crop(box)
                frames.append(_fit(cropped, max_side))
                durations.append(int(frame.info.get("duration") or default_duration))
            out = _save_animated(frames, durations, loop, fmt)
        else:
            # The rectangle comes in browser coordinates, which already apply the
            # EXIF orientation: it is applied before cropping.
            oriented = ImageOps.exif_transpose(img)
            box = _resolve_box(crop, *oriented.size)
            out = _save_static(_fit(oriented.crop(box), max_side), fmt)
    except ValidationError:
        raise
    except Image.DecompressionBombError:
        raise ValidationError(MSG_PIXELS)
    except (OSError, SyntaxError, ValueError, EOFError):
        raise ValidationError(MSG_UNREADABLE)
    finally:
        img.close()

    return SimpleUploadedFile(f"upload.{ext}", out, content_type=content_type)
