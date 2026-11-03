/**
 * ReminderFormModal — modal to create or edit a Reminder.
 *
 * Fields:
 * - title (text)
 * - remind_at (datetime-local)
 * - recur (dropdown: none | yearly | monthly | weekly)
 * - lead_minutes (number)
 * - person (dropdown, optional — includes a "No person" option)
 * - kind (type: task, call, meeting, birthday, other)
 * - location + participants (only if kind = meeting)
 * - message (textarea)
 *
 * In "edit" mode it is populated with the existing reminder's values. For
 * editing, only the partial PATCH with the modified fields is sent.
 */

import { useEffect, useState } from "react";
import type {
  PersonListItem,
  Recurrence,
  Reminder,
  ReminderCreate,
  ReminderKind,
} from "../../types";
import { useTranslation } from "../../i18n";
import Avatar from "../ui/Avatar";
import { REMINDER_KINDS } from "./reminderKind";

interface ReminderFormModalProps {
  open: boolean;
  /** If set, it is an edit; otherwise, a creation. */
  reminder: Reminder | null;
  persons: PersonListItem[];
  /** The reminder being edited, to exclude from the active people list if it is completed. */
  onSave: (data: ReminderCreate) => Promise<void> | void;
  onCancel: () => void;
}

interface FormState {
  title: string;
  remind_at: string; // datetime-local format YYYY-MM-DDTHH:mm
  recur: Recurrence;
  lead_minutes: string; // string in the form, parsed on submit
  person_id: string; // "" | stringified number
  kind: ReminderKind;
  location: string;
  participants: number[];
  message: string;
}

function isoToLocal(iso: string): string {
  // datetime-local wants YYYY-MM-DDTHH:mm in LOCAL time.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localToIso(local: string): string {
  // Interpret as local time and return ISO with timezone.
  if (!local) return "";
  const d = new Date(local);
  return d.toISOString();
}

function emptyForm(): FormState {
  return {
    title: "",
    remind_at: "",
    recur: "none",
    lead_minutes: "0",
    person_id: "",
    kind: "task",
    location: "",
    participants: [],
    message: "",
  };
}

function fromReminder(r: Reminder): FormState {
  return {
    title: r.title,
    remind_at: isoToLocal(r.remind_at),
    recur: r.recur,
    lead_minutes: String(r.lead_minutes ?? 0),
    person_id: r.person == null ? "" : String(r.person),
    kind: r.kind ?? "task",
    location: r.location ?? "",
    participants: r.participants ?? [],
    message: r.message ?? "",
  };
}

const RECURRENCES: Recurrence[] = ["none", "yearly", "monthly", "weekly"];

export default function ReminderFormModal({
  open,
  reminder,
  persons,
  onSave,
  onCancel,
}: ReminderFormModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantQuery, setParticipantQuery] = useState("");

  // Reset form when opened/closed or when the reminder being edited changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setParticipantQuery("");
    setForm(reminder ? fromReminder(reminder) : emptyForm());
  }, [open, reminder]);

  if (!open) return null;

  const isEdit = reminder !== null;
  const isMeeting = form.kind === "meeting";

  // Participant candidates: everyone except the main person, filtered by search.
  const candidates = persons.filter((p) => {
    if (form.person_id !== "" && p.id === Number(form.person_id)) return false;
    const q = participantQuery.trim().toLowerCase();
    if (!q) return true;
    return `${p.first_name} ${p.last_name} ${p.nick_name}`.toLowerCase().includes(q);
  });

  const toggleParticipant = (id: number) => {
    setForm((prev) => ({
      ...prev,
      participants: prev.participants.includes(id)
        ? prev.participants.filter((x) => x !== id)
        : [...prev.participants, id],
    }));
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t("reminder.errors.title_required"));
      return;
    }
    if (!form.remind_at) {
      setError(t("reminder.errors.remind_at_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const lead = Number.parseInt(form.lead_minutes, 10);
      const payload: ReminderCreate = {
        title: form.title.trim(),
        remind_at: localToIso(form.remind_at),
        recur: form.recur,
        lead_minutes: Number.isFinite(lead) ? lead : 0,
        message: form.message,
        person: form.person_id === "" ? null : Number(form.person_id),
        kind: form.kind,
        // Location and participants only exist in meetings.
        location: isMeeting ? form.location.trim() : "",
        participants: isMeeting
          ? form.participants.filter((id) => id !== Number(form.person_id || 0))
          : [],
      };
      await onSave(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.loading");
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-form-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={t("common.cancel")}
        onClick={onCancel}
        className="absolute inset-0 cursor-default border-0 bg-black/40"
      />
      <form
        onSubmit={submit}
        className="neo-card relative z-50 max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-6 shadow-lg"
      >
        <h2
          id="reminder-form-title"
          className="text-sm font-semibold"
        >
          {isEdit ? t("common.edit") + " · " + t("reminder.title_singular") : t("reminder.add")}
        </h2>

        {/* Title */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.title_singular")}
          </span>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className="neo-input"
            placeholder=""
          />
        </label>

        {/* remind_at */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.remind_at")}
          </span>
          <input
            type="datetime-local"
            required
            value={form.remind_at}
            onChange={(e) => update("remind_at", e.target.value)}
            className="neo-input"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          {/* recur */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {t("reminder.recur")}
            </span>
            <select
              value={form.recur}
              onChange={(e) => update("recur", e.target.value as Recurrence)}
              className="neo-input"
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {t(`enums.reminder.recurrence.${r}`)}
                </option>
              ))}
            </select>
          </label>

          {/* lead_minutes */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {t("reminder.lead_minutes")}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.lead_minutes}
              onChange={(e) => update("lead_minutes", e.target.value)}
              className="neo-input"
            />
          </label>
        </div>

        {/* person */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("person.title_singular")}
          </span>
          <select
            value={form.person_id}
            onChange={(e) => update("person_id", e.target.value)}
            className="neo-input"
          >
            <option value="">{t("reminder.no_person")}</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
                {p.nick_name ? ` (${p.nick_name})` : ""}
              </option>
            ))}
          </select>
        </label>

        {/* kind */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("reminder.kind")}</span>
          <select
            value={form.kind}
            onChange={(e) => update("kind", e.target.value as ReminderKind)}
            className="neo-input"
          >
            {REMINDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`enums.reminder.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>

        {isMeeting && (
          <>
            {/* location */}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t("reminder.location")}</span>
              <input
                type="text"
                maxLength={200}
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                className="neo-input"
              />
            </label>

            {/* participants */}
            <div>
              <span className="mb-1.5 block text-sm font-medium">
                {t("reminder.participants")}
              </span>
              <input
                type="search"
                value={participantQuery}
                onChange={(e) => setParticipantQuery(e.target.value)}
                placeholder={t("reminder.participants_search")}
                aria-label={t("reminder.participants_search")}
                className="neo-input mb-2"
              />
              <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {candidates.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-fg-muted">{t("common.no_results")}</li>
                ) : (
                  candidates.map((p) => {
                    const name = `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim();
                    return (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                          <input
                            type="checkbox"
                            className="size-4 rounded"
                            checked={form.participants.includes(p.id)}
                            onChange={() => toggleParticipant(p.id)}
                          />
                          <Avatar name={name} photoId={p.profile_photo} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
              <p className="mt-1.5 text-xs text-fg-muted tabular-nums">
                {t("reminder.participants_selected", { count: form.participants.length })}
              </p>
            </div>
          </>
        )}

        {/* message */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.message")}
          </span>
          <textarea
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            rows={3}
            className="neo-input resize-y"
          />
        </label>

        {error ? (
          <p className="rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="neo-btn"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="neo-btn neo-btn-primary"
          >
            {submitting ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}