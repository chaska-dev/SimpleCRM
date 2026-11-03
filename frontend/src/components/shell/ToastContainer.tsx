import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useTranslation, withLang } from "../../i18n";
import type { Lang } from "../../types";
import { toast, TOAST_EVENT, type ToastPayload, type ToastVariant } from "../../lib/toaster";

interface ToastItem extends Required<Pick<ToastPayload, "id" | "variant" | "message">> {
  duration: number;
}

/**
 * ToastContainer — global toast listener.
 *
 * Mounted in AppShell (client:load) and renders the messages fired with
 * `toast(...)`, `toast.success(...)`, etc.
 */
interface ToastContainerProps {
  lang?: Lang;
}

function ToastContainer(_props: ToastContainerProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // One timeout per toast (by id): a new toast arriving does not restart the others.
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail?.message) return;
      setItems((prev) => [
        ...prev,
        {
          id: detail.id ?? `t_${Date.now()}`,
          variant: detail.variant,
          message: detail.message,
          duration: detail.duration ?? 3500,
        },
      ]);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const live = new Set(items.map((item) => item.id));
    // Toasts that are gone (closed by hand): clear their timer.
    timers.current.forEach((timer, id) => {
      if (!live.has(id)) {
        window.clearTimeout(timer);
        timers.current.delete(id);
      }
    });
    // Only new toasts arm a timer.
    for (const item of items) {
      if (item.duration <= 0 || timers.current.has(item.id)) continue;
      timers.current.set(
        item.id,
        window.setTimeout(() => dismiss(item.id), item.duration),
      );
    }
  }, [items, dismiss]);

  // On unmount all pending timers are cancelled.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0"
    >
      {items.map((item) => (
        <ToastItemView key={item.id} item={item} onClose={() => dismiss(item.id)} />
      ))}
    </div>
  );
}

function variantClasses(variant: ToastVariant): string {
  switch (variant) {
    case "success":
      return "bg-status-ok text-status-ok-fg";
    case "error":
      return "bg-status-overdue text-status-overdue-fg";
    case "warning":
      return "bg-status-due-soon text-status-due-soon-fg";
    case "info":
    default:
      return "bg-surface text-fg";
  }
}

function variantIcon(variant: ToastVariant) {
  const cls = "size-4 shrink-0";
  switch (variant) {
    case "success":
      return <CheckCircle2 className={cls} aria-hidden="true" />;
    case "error":
      return <AlertCircle className={cls} aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className={cls} aria-hidden="true" />;
    case "info":
    default:
      return <Info className={cls} aria-hidden="true" />;
  }
}

function ToastItemView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border border-border px-4 py-3 shadow-lg ${variantClasses(item.variant)}`}
    >
      {variantIcon(item.variant)}
      <p className="flex-1 text-sm font-medium leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// expose toast from the container in case an island uses it
export { toast };

export default withLang(ToastContainer);
