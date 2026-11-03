/**
 * Minimal toaster — global dispatcher for toasts.
 *
 * Pattern:
 * - <ToastContainer client:load /> is mounted in AppShell.
 * - Any component calls `toast.success("Person created")` from anywhere.
 * - Messages are dispatched through `window` (custom event); the container listens and stacks them.
 *
 * This avoids Zustand for a small case and keeps any component free
 * from importing the container directly.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastPayload {
  id?: string;
  variant: ToastVariant;
  message: string;
  /** ms before auto-closing. 0 = no auto-close. Default 3500. */
  duration?: number;
}

const CHANNEL = "crm:toast";

export function toast(payload: Omit<ToastPayload, "id">): void {
  if (typeof window === "undefined") return;
  const detail: ToastPayload = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    duration: 3500,
    ...payload,
  };
  window.dispatchEvent(new CustomEvent(CHANNEL, { detail }));
}

toast.success = (message: string, duration?: number): void => {
  toast({ variant: "success", message, duration });
};
toast.error = (message: string, duration?: number): void => {
  toast({ variant: "error", message, duration: duration ?? 6000 });
};
toast.warning = (message: string, duration?: number): void => {
  toast({ variant: "warning", message, duration });
};
toast.info = (message: string, duration?: number): void => {
  toast({ variant: "info", message, duration });
};

export const TOAST_EVENT = CHANNEL;
