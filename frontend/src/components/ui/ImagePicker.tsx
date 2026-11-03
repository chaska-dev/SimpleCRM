/**
 * useImagePicker — shared picker + validation + crop (spec v7 O).
 *
 * Used by: user photo (Settings > Account), person photo (detail > Contact),
 * organization logo (form) and brand icon (Settings > General).
 *
 *   const picker = useImagePicker({ variant: "avatar", maxBytes: 2 * MB, onConfirm });
 *   <button onClick={picker.open}>...</button>
 *   {picker.input}{picker.modal}
 *   {picker.error && <p role="alert">{picker.error}</p>}
 *
 * Flow: choose file -> validate (MIME + byte signature + size + decoding) ->
 * on failure, inline error + toast; on success, opens ImageCropModal. `onConfirm` receives the
 * ORIGINAL file and the crop rectangle in pixels of the original image (not a
 * canvas, so GIFs keep their animation). If `onConfirm` resolves, the modal closes;
 * if it throws, it stays open to retry (the caller shows its own error).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { toast } from "../../lib/toaster";
import ImageCropModal, { type CropRect, type ImageVariant } from "./ImageCropModal";

export type { CropRect, ImageVariant } from "./ImageCropModal";

export const MB = 1024 * 1024;

export const IMAGE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif";
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Result of choosing and cropping: the original, the crop and the original size. */
export interface PickResult {
  file: File;
  crop: CropRect;
  width: number;
  height: number;
}

/** Adds `crop_x`, `crop_y`, `crop_w`, `crop_h` to a FormData. */
export function appendCrop(fd: FormData, crop: CropRect): void {
  fd.append("crop_x", String(crop.x));
  fd.append("crop_y", String(crop.y));
  fd.append("crop_w", String(crop.w));
  fd.append("crop_h", String(crop.h));
}

/** "1,5 MB" / "500 KB" depending on the language. */
export function formatImageBytes(bytes: number, lang: string): string {
  if (bytes >= MB) {
    const n = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(bytes / MB);
    return `${n} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Byte signature: PNG 89 50 4E 47, JPEG FF D8 FF, GIF 47 49 46 38, WEBP RIFF....WEBP. */
async function sniffImageType(file: File): Promise<"png" | "jpeg" | "gif" | "webp" | null> {
  let b: Uint8Array;
  try {
    b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return null;
}

type Validation =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; reason: "not_image" | "too_big" | "unreadable" };

/** Validates type (MIME + signature), size and that the browser can decode the image. */
export async function validateImage(file: File, maxBytes: number): Promise<Validation> {
  if (file.type && !ALLOWED_MIME.includes(file.type)) return { ok: false, reason: "not_image" };
  if ((await sniffImageType(file)) === null) return { ok: false, reason: "not_image" };
  if (file.size > maxBytes) return { ok: false, reason: "too_big" };

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { ok: true, url, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, reason: "unreadable" };
  }
}

interface Options {
  variant: ImageVariant;
  /** Maximum size of the original file, in bytes. */
  maxBytes: number;
  onConfirm: (result: PickResult) => void | Promise<void>;
}

interface Picked {
  file: File;
  url: string;
  width: number;
  height: number;
}

export function useImagePicker({ variant, maxBytes, onConfirm }: Options): {
  /** Opens the file picker. */
  open: () => void;
  /** Hidden <input type="file">: render it once. */
  input: ReactNode;
  /** Crop modal: render it once. */
  modal: ReactNode;
  /** Validation error to show inline (also emitted as a toast). */
  error: string | null;
  clearError: () => void;
  busy: boolean;
} {
  const { t, lang } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pickedSizeRef = useRef(0);

  // Releases the object URL when the image changes or on unmount.
  useEffect(() => {
    const url = picked?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [picked?.url]);

  const fail = useCallback(
    (reason: "not_image" | "too_big" | "unreadable") => {
      const message =
        reason === "too_big"
          ? t("image.errors.too_big", {
              size: formatImageBytes(pickedSizeRef.current, lang),
              max: formatImageBytes(maxBytes, lang),
            })
          : t(`image.errors.${reason}`);
      setError(message);
      toast.error(message);
    },
    [t, lang, maxBytes],
  );

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allows choosing the same file again
      if (!file) return;
      pickedSizeRef.current = file.size;
      const result = await validateImage(file, maxBytes);
      if (!result.ok) {
        fail(result.reason);
        return;
      }
      setError(null);
      setPicked({ file, url: result.url, width: result.width, height: result.height });
    },
    [maxBytes, fail],
  );

  const close = useCallback(() => setPicked(null), []);

  const confirm = useCallback(
    async (crop: CropRect) => {
      if (!picked) return;
      setBusy(true);
      try {
        await onConfirm({ file: picked.file, crop, width: picked.width, height: picked.height });
        setPicked(null);
      } catch {
        // The caller already reports the error; the modal stays open to retry.
      } finally {
        setBusy(false);
      }
    },
    [picked, onConfirm],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={IMAGE_ACCEPT}
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={onChange}
    />
  );

  const modal = (
    <ImageCropModal
      image={picked}
      variant={variant}
      busy={busy}
      onCancel={close}
      onConfirm={confirm}
    />
  );

  return {
    open: () => inputRef.current?.click(),
    input,
    modal,
    error,
    clearError: () => setError(null),
    busy,
  };
}
