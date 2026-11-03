/**
 * Shared helpers for the dashboard: real backend shape (`RawDashboard`)
 * and normalization to the `DashboardData` declared in `src/types/index.ts`.
 *
 * The backend returns upcoming dates as `upcoming_important_dates` (with
 * `person` = id and `person_name`); here they are converted to `upcoming_events` with the
 * person summarized to show avatar and name.
 *
 * We also export `RawDashboard` so the SSR of `pages/dashboard.astro`
 * can do the fetch and normalize before passing to the island.
 */
import type {
  CadenceStatus,
  DashboardData,
  DashboardSuggestion,
  ImportantDate,
  PersonListItem,
  Reminder,
} from "../../types";

export interface RawEvent {
  id: number;
  person: number;
  kind: "birthday" | "custom";
  birth_year: number | null;
  title: string;
  description: string;
  icon: string;
  icon_image: number | null;
  attachment: number | null;
  date: string;
  days_until_next: number | null;
  age: number | null;
  /** Visible name of the person (only in `upcoming_important_dates`). */
  person_name?: string;
}

export interface RawDashboard {
  calendar: RawEvent[];
  recent: PersonListItem[];
  favorite_count: number;
  favorites?: PersonListItem[];
  upcoming_important_dates: RawEvent[];
  pending_reminders?: Reminder[];
  pending_reminders_total?: number;
  suggestions?: DashboardSuggestion[];
}

/** Minimal PersonListItem (id + visible name) for cards that do not bring the full person. */
export function makePersonStub(id: number, name = "?"): PersonListItem {
  return {
    id,
    first_name: name,
    last_name: "",
    nick_name: "",
    company: "",
    role: "",
    favorite: false,
    cadence_days: null,
    last_contacted_at: null,
    cadence_status: "unknown" as CadenceStatus,
    tags: [],
    contact_types: [],
    profile_photo: null,
  };
}

/** Normalizes the backend response to the `DashboardData` shape. */
export function normalizeDashboard(raw: RawDashboard): DashboardData {
  const pending = raw.pending_reminders ?? [];
  return {
    calendar: raw.calendar ?? [],
    recent: raw.recent ?? [],
    favorite_count: raw.favorite_count ?? 0,
    favorites: raw.favorites ?? [],
    upcoming_events: (raw.upcoming_important_dates ?? []).map((ev) => ({
      id: ev.id,
      person: makePersonStub(ev.person, ev.person_name || "?"),
      kind: ev.kind,
      birth_year: ev.birth_year,
      title: ev.title,
      description: ev.description,
      icon: ev.icon,
      icon_image: ev.icon_image,
      attachment: ev.attachment,
      date: ev.date,
      days_until_next: ev.days_until_next,
      age: ev.age,
    } as ImportantDate & { person: PersonListItem })),
    pending_reminders: pending,
    pending_reminders_total: raw.pending_reminders_total ?? pending.length,
    suggestions: raw.suggestions ?? [],
  };
}

// ---------------------------------------------------------------------------
// Optimistic update of "mark contacted" (shared with /persons/).
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Same rule as `Person.cadence_status` in backend/crm/models.py. */
export function computeCadenceStatus(
  cadenceDays: number | null,
  lastContactedAt: string | null,
  now: number = Date.now(),
): CadenceStatus {
  if (cadenceDays === null || cadenceDays === undefined) return "no_cadence";
  if (!lastContactedAt) return "unknown";
  const nextDue = new Date(lastContactedAt).getTime() + cadenceDays * DAY_MS;
  if (now > nextDue) return "overdue";
  if (now + 3 * DAY_MS > nextDue) return "due_soon";
  return "ok";
}

/** Copy of the person with `last_contacted_at = now` and cadence recalculated. */
export function markedContactedNow(person: PersonListItem): PersonListItem {
  const now = new Date();
  return {
    ...person,
    last_contacted_at: now.toISOString(),
    cadence_status: computeCadenceStatus(person.cadence_days, now.toISOString(), now.getTime()),
  };
}

/** Replaces only the `next` item (by id); keeps the identity of the others. */
export function replacePerson(list: PersonListItem[], next: PersonListItem): PersonListItem[] {
  return list.map((p) => (p.id === next.id ? next : p));
}

/** Has the reminder's time already passed? (for the "Overdue" mark). */
export function isReminderOverdue(reminder: Reminder, now: number = Date.now()): boolean {
  return new Date(reminder.remind_at).getTime() < now;
}

/** Replaces the person within the suggestions, keeping reason and days. */
export function replaceSuggestionPerson(
  list: DashboardSuggestion[],
  next: PersonListItem,
): DashboardSuggestion[] {
  return list.map((s) => (s.person.id === next.id ? { ...s, person: next } : s));
}
