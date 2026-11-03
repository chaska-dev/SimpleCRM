/**
 * Shared date formatting. Everything goes through Intl: never raw ISO nor
 * toLocaleDateString() without options.
 *
 * - formatDate:     "29 Oct 2026"
 * - formatDateTime: "29 Oct 2026, 18:00"
 * - formatRelative: "9 days ago", "in 2 days", "today" (numeric: "auto")
 *
 * "YYYY-MM-DD" dates (without time) are interpreted in local time to avoid
 * the one-day shift that `new Date("2026-10-29")` (UTC) produces.
 */

import type { Lang } from "../types";

const DAY_MS = 86_400_000;

function localeOf(lang: Lang | string | undefined): string {
  return lang === "en" ? "en-US" : "es-CL";
}

/** Parses an ISO string (with or without time). Returns null if invalid. */
export function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null | undefined, lang: Lang | string = "es"): string {
  const d = parseIso(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(d)
    .replace(/\./g, "");
}

export function formatDateTime(iso: string | null | undefined, lang: Lang | string = "es"): string {
  const d = parseIso(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\./g, "");
}

/** Time only ("18:00"). */
export function formatTime(iso: string | null | undefined, lang: Lang | string = "es"): string {
  const d = parseIso(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeOf(lang), { hour: "2-digit", minute: "2-digit" }).format(d);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Difference in calendar days (positive = future). */
export function dayDiff(iso: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseIso(iso);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
}

export function formatRelative(iso: string | null | undefined, lang: Lang | string = "es"): string {
  const days = dayDiff(iso);
  if (days === null) return "";
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: "auto" });
  const abs = Math.abs(days);
  if (abs < 31) return rtf.format(days, "day");
  if (abs < 365) return rtf.format(Math.round(days / 30), "month");
  return rtf.format(Math.round(days / 365), "year");
}

/** Month name (0-11) in the active language, with the first letter capitalized. */
export function formatMonthName(monthIndex: number, lang: Lang | string = "es"): string {
  const name = new Intl.DateTimeFormat(localeOf(lang), { month: "long" }).format(
    new Date(2024, monthIndex, 1),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
}
