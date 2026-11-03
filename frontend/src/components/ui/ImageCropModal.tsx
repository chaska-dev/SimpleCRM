/**
 * ImageCropModal — 1:1 square crop of a chosen image (spec v7 O).
 *
 * - Uses react-easy-crop: drag, zoom with slider (and wheel / pinch), keyboard (arrows).
 * - Round mask (`variant="avatar"`: user and person photo) or square
 *   (`"logo"`: organization logo, `"sidebar"`: brand icon).
 * - Animated GIF/WEBP files play animated (it is a normal <img>): nothing is rasterized.
 * - Live preview at the real usage size (small and large avatar, logo in the list and
 *   on the detail page, sidebar icon), computed with CSS from the crop rectangle.
 * - Delivers the rectangle in PIXELS OF THE ORIGINAL IMAGE; the backend crops the original
 *   file (so GIFs keep their animation).
 *
 * `image` = null keeps the modal closed. Escape cancels without closing a parent modal.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n";

/** Crop rectangle in pixels of the original image. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ImageVariant = "avatar" | "logo" | "sidebar";

/** Image already validated and decoded by the picker. */
export interface PickedImage {
  file: File;
  /** Object URL of the file (released by whoever created it). */
  url: string;
  width: number;
  height: number;
}

interface PreviewSpec {
  labelKey: string;
  size: number;
  /** CSS border-radius; "round" = circle. */
  radius: string;
}

const PREVIEWS: Record<ImageVariant, PreviewSpec[]> = {
  avatar: [
    { labelKey: "image.crop.preview_avatar_small", size: 32, radius: "round" },
    { labelKey: "image.crop.preview_avatar_large", size: 64, radius: "round" },
  ],
  logo: [
    { labelKey: "image.crop.preview_logo_small", size: 40, radius: "var(--radius-md)" },
    { labelKey: "image.crop.preview_logo_large", size: 64, radius: "var(--radius-lg)" },
  ],
  sidebar: [{ labelKey: "image.crop.preview_sidebar", size: 32, radius: "var(--radius-md)" }],
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * Shows the crop of `image` in a `size` px box (no canvas: also works
 * for animated GIFs). `crop` is in pixels of the original image.
 */
export function CropPreview({
  src,
  width,
  height,
  crop,
  size,
  round = false,
  radius = "var(--radius-md)",
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  crop: CropRect;
  size: number;
  round?: boolean;
  radius?: string;
  className?: string;
}) {
  const scale = size / Math.max(1, crop.w);
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden bg-muted ${className}`}
      style={{ width: size, height: size, borderRadius: round ? "9999px" : radius }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          maxWidth: "none",
          left: -crop.x * scale,
          top: -crop.y * scale,
          width: width * scale,
          height: height * scale,
        }}
      />
    </span>
  );
}

interface Props {
  image: PickedImage | null;
  variant: ImageVariant;
  /** Saving: blocks buttons and gestures. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (crop: CropRect) => void | Promise<void>;
}

export default function ImageCropModal({ image, variant, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const zoomId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef<HTMLInputElement | null>(null);

  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropRect | null>(null);

  const round = variant === "avatar";
  const open = image !== null;

  // Each new image starts centered and without zoom.
  useEffect(() => {
    setPoint({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
  }, [image?.url]);

  // Escape cancels (in capture, so a parent modal is not closed too), scroll
  // lock, focus to the slider and focus returned on close.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (!busyRef.current) onCancel();
        return;
      }
      if (e.key === "Tab" && cardRef.current) {
        const items = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !cardRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => zoomRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      previouslyFocused?.focus?.();
    };
    // onCancel may change on every parent render; the handler uses the current version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCropAreaChange = useCallback(
    (_percent: unknown, px: { x: number; y: number; width: number; height: number }) => {
      setArea({ x: px.x, y: px.y, w: px.width, h: px.height });
    },
    [],
  );

  if (!image || typeof document === "undefined") return null;

  const handleConfirm = () => {
    if (!area || busy) return;
    const x = Math.max(0, Math.min(image.width - 1, Math.round(area.x)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(area.y)));
    const w = Math.max(1, Math.min(image.width - x, Math.round(area.w)));
    const h = Math.max(1, Math.min(image.height - y, Math.round(area.h)));
    void onConfirm({ x, y, w, h });
  };

  const animatedHint = /^image\/(gif|webp)$/.test(image.file.type);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="neo-card flex max-h-[92vh] w-full max-w-lg flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-sm font-semibold">
            {t("image.crop.title")}
          </h2>
          <button
            type="button"
            className="btn-icon -mr-2"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div
            className="relative h-64 w-full overflow-hidden rounded-md bg-neutral-900 sm:h-72"
            role="group"
            aria-label={t("image.crop.area_label")}
          >
            <Cropper
              image={image.url}
              crop={point}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={1}
              cropShape={round ? "round" : "rect"}
              showGrid={!round}
              onCropChange={setPoint}
              onZoomChange={setZoom}
              onCropAreaChange={onCropAreaChange}
              onCropComplete={onCropAreaChange}
              style={{
                containerStyle: { pointerEvents: busy ? "none" : "auto" },
                cropAreaStyle: { border: "2px solid rgba(255,255,255,0.9)" },
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor={zoomId} className="shrink-0 text-sm font-medium">
              {t("image.crop.zoom")}
            </label>
            <input
              id={zoomId}
              ref={zoomRef}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy}
              className="h-2 w-full cursor-pointer accent-[var(--color-primary)]"
            />
          </div>
          <p className="text-xs text-fg-muted">
            {t("image.crop.drag_hint")}
            {animatedHint && ` ${t("image.crop.animated_note")}`}
          </p>

          <div>
            <p className="mb-2 text-xs font-medium text-fg-muted">{t("image.crop.preview")}</p>
            <div className="flex flex-wrap items-end gap-6">
              {PREVIEWS[variant].map((p) => (
                <div key={p.labelKey} className="flex flex-col items-center gap-1.5">
                  {area ? (
                    <CropPreview
                      src={image.url}
                      width={image.width}
                      height={image.height}
                      crop={area}
                      size={p.size}
                      round={p.radius === "round"}
                      radius={p.radius}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="block bg-muted"
                      style={{
                        width: p.size,
                        height: p.size,
                        borderRadius: p.radius === "round" ? "9999px" : p.radius,
                      }}
                    />
                  )}
                  <span className="text-xs text-fg-muted">{t(p.labelKey)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" className="neo-btn" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={handleConfirm}
            disabled={busy || !area}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
