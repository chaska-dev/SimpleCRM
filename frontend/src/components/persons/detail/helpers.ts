/**
 * Helpers shared by the detail view tabs.
 *
 * Keeping pure functions here lets them be used from server-rendered code and from
 * React islands without duplicating logic.
 */

import type { Lang, CadenceStatus, ImportantDate } from "../../../types";
import { t as i18nT, getDocLang } from "../../../i18n";
import {
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
  formatRelative as fmtRelative,
} from "../../../utils/format";

/** Full name + nick. */
export function displayName(p: { first_name: string; last_name: string; nick_name: string }): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full || p.nick_name || "?";
}

/**
 * Readable date-time ("29 Oct 2026, 18:00"). Delegates to utils/format.ts.
 * If `lang` is not passed, uses the document language (<html lang>).
 */
export function formatDateTime(iso: string | null | undefined, lang?: Lang): string {
  return fmtDateTime(iso, lang ?? getDocLang());
}

/** Readable date ("29 Oct 2026"). Delegates to utils/format.ts. */
export function formatDate(iso: string | null | undefined, lang?: Lang): string {
  return fmtDate(iso, lang ?? getDocLang());
}

/** Relative date ("9 days ago"). Delegates to utils/format.ts. */
export function formatRelative(iso: string | null | undefined, lang?: Lang): string {
  return fmtRelative(iso, lang ?? getDocLang());
}

/** Format ISO datetime for input[type=datetime-local]. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** Format ISO date → input[type=date] value. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return "";
  }
}

/** Format bytes → human readable. */
export function formatBytes(bytes: number): { value: number; unit: "B" | "KB" | "MB" | "GB" } {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: 0, unit: "B" };
  if (bytes < 1024) return { value: bytes, unit: "B" };
  const kb = bytes / 1024;
  if (kb < 1024) return { value: Math.round(kb * 10) / 10, unit: "KB" };
  const mb = kb / 1024;
  if (mb < 1024) return { value: Math.round(mb * 10) / 10, unit: "MB" };
  return { value: Math.round((mb / 1024) * 10) / 10, unit: "GB" };
}

/** Returns the i18n key for the cadence_status. */
export function cadenceStatusKey(status: CadenceStatus): string {
  return `enums.cadence_status.${status}`;
}

/** i18n helper (single-shot) to avoid coupling to a hook. */
export function tr(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  return i18nT(lang, key, vars);
}

/** Suggested contact types (`icon` is a key of `ui/icons.tsx`) — fallback if the backend does not expose /api/contacts/types/. */
/**
 * Visible title of an important date. The birthday created by the UI and the
 * agents stores the title "Cumpleaños" in the DB: in that case (or with no title) the
 * type name is shown in the active language. A title typed by the
 * user is respected as is.
 */
export function importantDateTitle(
  t: (key: string) => string,
  date: { kind: string; title: string },
): string {
  const title = (date.title ?? "").trim();
  if (date.kind === "birthday" && (!title || title.toLowerCase() === "cumpleaños")) {
    return t("enums.person.kinds.birthday");
  }
  return title;
}

/**
 * Visible name of a contact type in the active language. Known types
 * come from i18n; a free-form one (typed by the user) is shown as is.
 */
export function contactTypeLabel(
  t: (key: string) => string,
  contact: { type: string; type_display?: string },
): string {
  const key = `enums.contact.types.${contact.type}`;
  const label = t(key);
  return label !== key ? label : contact.type_display || contact.type;
}

export interface ContactTypeOption {
  key: string;
  label: string;
  icon: string;
}

export const CONTACT_TYPE_SUGGESTIONS: ContactTypeOption[] = [
  { key: "personal_phone", label: "enums.contact.types.personal_phone", icon: "personal_phone" },
  { key: "personal_email", label: "enums.contact.types.personal_email", icon: "personal_email" },
  { key: "work_phone", label: "enums.contact.types.work_phone", icon: "work_phone" },
  { key: "work_email", label: "enums.contact.types.work_email", icon: "work_email" },
  { key: "whatsapp", label: "enums.contact.types.whatsapp", icon: "whatsapp" },
  { key: "telegram", label: "enums.contact.types.telegram", icon: "telegram" },
  { key: "instagram", label: "enums.contact.types.instagram", icon: "instagram" },
  { key: "facebook", label: "enums.contact.types.facebook", icon: "facebook" },
  { key: "x", label: "enums.contact.types.x", icon: "x" },
  { key: "linkedin", label: "enums.contact.types.linkedin", icon: "linkedin" },
  { key: "discord", label: "enums.contact.types.discord", icon: "discord" },
  { key: "other", label: "enums.contact.types.other", icon: "other" },
];

/**
 * Set of "social" types — the ones we show as small icons on the PersonCard.
 * Excludes phones and emails (not social). Keep in sync with
 * `CONTACT_TYPE_SUGGESTIONS`.
 */
export const SOCIAL_CONTACT_TYPES = new Set<string>([
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "discord",
]);

export function iconForContactType(typeKey: string): string {
  return CONTACT_TYPE_SUGGESTIONS.find((c) => c.key === typeKey)?.icon ?? "other";
}

/** Computes the next occurrence of an ImportantDate (date is YYYY-MM-DD). */
export function nextOccurrence(date: ImportantDate): { iso: string; daysFromNow: number } | null {
  if (!date.date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date.date + "T00:00:00");
  if (Number.isNaN(target.getTime())) return null;
  // If it already passed this year, next year (birthday style).
  target.setFullYear(today.getFullYear());
  if (target.getTime() < today.getTime()) {
    target.setFullYear(today.getFullYear() + 1);
  }
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return { iso: target.toISOString(), daysFromNow: days };
}