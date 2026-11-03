/**
 * Shared design system types.
 * Mirror of the tokens in CSS vars — use when you need to reference them
 * from TypeScript (e.g. for color selects, dropdowns, etc).
 */

export type StatusKey =
  | "ok"
  | "due_soon"
  | "overdue"
  | "unknown"
  | "no_cadence";

export type StatusToken = {
  /** tailwind className for the bg (without the `bg-` prefix) */
  bg: string;
  /** tailwind className for the fg (without the `text-` prefix) */
  fg: string;
  /** tailwind className for the border (without the `border-` prefix) */
  border: string;
  /** Full bg + fg classes, literal so Tailwind detects them. */
  badge: string;
};

export const STATUS_TOKENS: Record<StatusKey, StatusToken | null> = {
  ok: { bg: "status-ok", fg: "status-ok-fg", border: "border", badge: "bg-status-ok text-status-ok-fg" },
  due_soon: { bg: "status-due-soon", fg: "status-due-soon-fg", border: "border", badge: "bg-status-due-soon text-status-due-soon-fg" },
  overdue: { bg: "status-overdue", fg: "status-overdue-fg", border: "border", badge: "bg-status-overdue text-status-overdue-fg" },
  unknown: { bg: "status-unknown", fg: "status-unknown-fg", border: "border", badge: "bg-status-unknown text-status-unknown-fg" },
  no_cadence: null,
};
