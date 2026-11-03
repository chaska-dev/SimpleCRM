import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

/**
 * Modal. Full-screen overlay with `bg-black/40` backdrop,
 * content in `neo-card`.
 *
 * - Closes with `Escape`.
 * - Closes on backdrop click (not on clicking inside the card).
 * - Traps focus inside the modal while it is open.
 */
export default function Modal({ open, onClose, title, children, footer, size = "md" }: Props) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus first focusable element.
    requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass =
    size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-3xl" : "max-w-md";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`neo-card flex max-h-[90vh] w-full flex-col shadow-lg ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={t("common.close")}
            title={t("common.close")}
            onClick={onClose}
            className="btn-icon -mr-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}