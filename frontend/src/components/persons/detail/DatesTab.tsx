import { useState, useMemo, useCallback } from "react";
import { Check, Plus, Repeat, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import type {
  ImportantDate,
  Reminder,
  ImportantDateCreate,
  ReminderCreate,
  DateKind,
  Recurrence,
} from "../../../types";
import Modal from "./Modal";
import { DATE_ICON_KEYS, DEFAULT_DATE_ICON, IconByKey, resolveDateIconKey } from "../../ui/icons";
import ConfirmModal from "../../ui/ConfirmModal";
import {
  LoadingSwap,
  BorderedListSkeleton,
  ImportantDateCardSkeleton,
  ReminderRowSkeleton,
} from "../../ui";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  importantDateTitle,
  nextOccurrence,
} from "./helpers";

interface Props {
  personId: number;
  dates: ImportantDate[] | null;
  reminders: Reminder[] | null;
  onReload: () => Promise<void>;
}

type RemFilter = "all" | "upcoming" | "completed";

const DATE_KIND_KEYS: DateKind[] = ["birthday", "custom"];
const RECUR_KEYS: Recurrence[] = ["none", "yearly", "monthly", "weekly"];

/**
 * DatesTab — two sub-sections: "Important dates" + "Reminders".
 *
 * - Dates: rows with icon, title, next occurrence, age if birthday.
 * - Reminders: flat list with upcoming/completed/all filter.
 * - Creation modals for both.
 */
export default function DatesTab({ personId, dates, reminders, onReload }: Props) {
  const { t } = useTranslation();
  const [remFilter, setRemFilter] = useState<RemFilter>("upcoming");
  const [showAddDate, setShowAddDate] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [pendingRemDelete, setPendingRemDelete] = useState<Reminder | null>(null);
  const [pendingDateDelete, setPendingDateDelete] = useState<ImportantDate | null>(
    null,
  );

  const filteredReminders = useMemo(() => {
    if (!reminders) return [];
    if (remFilter === "all") return reminders;
    if (remFilter === "completed") return reminders.filter((r) => r.completed);
    return reminders.filter((r) => !r.completed);
  }, [reminders, remFilter]);

  const onAddDate = useCallback(
    async (payload: ImportantDateCreate) => {
      try {
        await apiFetch<ImportantDate>(
          `/api/persons/${personId}/important-dates/`,
          { method: "POST", body: payload },
        );
        toast.success(t("date.saved"));
        setShowAddDate(false);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [personId, onReload, t],
  );

  const onDeleteDate = useCallback(
    async (d: ImportantDate) => {
      try {
        await apiFetch<void>(`/api/persons/${personId}/important-dates/${d.id}/`, {
          method: "DELETE",
        });
        toast.success(t("date.deleted"));
        setPendingDateDelete(null);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
        setPendingDateDelete(null);
      }
    },
    [personId, onReload, t],
  );

  const onAddReminder = useCallback(
    async (payload: ReminderCreate) => {
      try {
        await apiFetch<Reminder>(`/api/reminders/`, {
          method: "POST",
          body: { ...payload, person: personId },
        });
        toast.success(t("reminder.saved"));
        setShowAddReminder(false);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [personId, onReload, t],
  );

  const onCompleteReminder = useCallback(
    async (r: Reminder) => {
      try {
        await apiFetch<Reminder>(`/api/reminders/${r.id}/complete/`, {
          method: "POST",
          body: {},
        });
        toast.success(t("reminder.completed_toast"));
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [onReload, t],
  );

  const onDeleteReminder = useCallback(
    async (r: Reminder) => {
      try {
        await apiFetch<void>(`/api/reminders/${r.id}/`, { method: "DELETE" });
        toast.success(t("reminder.deleted"));
        setPendingRemDelete(null);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
        setPendingRemDelete(null);
      }
    },
    [onReload, t],
  );

  return (
    <div className="divide-y divide-border">
      {/* ============ IMPORTANT DATES ============ */}
      <section className="py-5 first:pt-0">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">{t("date.title")}</h3>
          <button
            type="button"
            className="neo-btn neo-btn-sm"
            onClick={() => setShowAddDate(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("date.add")}
          </button>
        </div>
        <LoadingSwap
          loading={dates === null}
          label={t("common.loading")}
          skeleton={<BorderedListSkeleton rows={2} row={() => <ImportantDateCardSkeleton />} />}
        >
          {dates === null ? null : dates.length === 0 ? (
            <p className="text-xs text-fg-muted">{t("date.empty")}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {dates.map((d) => (
                <DateRow key={d.id} date={d} onDelete={() => setPendingDateDelete(d)} />
              ))}
            </ul>
          )}
        </LoadingSwap>
      </section>

      {/* ============ REMINDERS ============ */}
      <section className="py-5 last:pb-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("reminder.title")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="neo-input w-auto"
              aria-label={t("reminder.title")}
              value={remFilter}
              onChange={(e) => setRemFilter(e.target.value as RemFilter)}
            >
              <option value="upcoming">{t("reminder.upcoming")}</option>
              <option value="completed">{t("reminder.completed")}</option>
              <option value="all">{t("reminder.filter_all")}</option>
            </select>
            <button
              type="button"
              className="neo-btn neo-btn-sm"
              onClick={() => setShowAddReminder(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("reminder.add")}
            </button>
          </div>
        </div>
        <LoadingSwap
          loading={reminders === null}
          label={t("common.loading")}
          skeleton={<BorderedListSkeleton rows={2} row={() => <ReminderRowSkeleton />} />}
        >
          {reminders === null ? null : filteredReminders.length === 0 ? (
            <p className="text-xs text-fg-muted">{t(`reminder.empty.${remFilter === "completed" ? "completed" : remFilter === "all" ? "all" : "pending"}`)}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {filteredReminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  onComplete={() => onCompleteReminder(r)}
                  onDelete={() => setPendingRemDelete(r)}
                />
              ))}
            </ul>
          )}
        </LoadingSwap>
      </section>

      <AddDateModal
        open={showAddDate}
        onClose={() => setShowAddDate(false)}
        onAdd={onAddDate}
      />
      <AddReminderModal
        open={showAddReminder}
        onClose={() => setShowAddReminder(false)}
        onAdd={onAddReminder}
      />
      <ConfirmModal
        open={pendingDateDelete !== null}
        title={t("common.delete")}
        message={
          pendingDateDelete
            ? `${pendingDateDelete.title}. ${t("common.confirm_delete")}`
            : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (pendingDateDelete) return onDeleteDate(pendingDateDelete);
          return Promise.resolve();
        }}
        onCancel={() => setPendingDateDelete(null)}
      />
      <ConfirmModal
        open={pendingRemDelete !== null}
        title={t("common.delete")}
        message={
          pendingRemDelete
            ? `${pendingRemDelete.title}. ${t("common.confirm_delete")}`
            : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (pendingRemDelete) return onDeleteReminder(pendingRemDelete);
          return Promise.resolve();
        }}
        onCancel={() => setPendingRemDelete(null)}
      />
    </div>
  );
}

function DateRow({
  date,
  onDelete,
}: {
  date: ImportantDate;
  onDelete: () => void;
}) {
  const { t, lang } = useTranslation();
  const next = nextOccurrence(date);
  const ageLine =
    date.kind === "birthday" && date.age !== null && date.age !== undefined
      ? t("dashboard.age_display", { age: date.age })
      : null;

  const daysLabel =
    next === null
      ? null
      : next.daysFromNow === 0
        ? t("date.today")
        : next.daysFromNow === 1
          ? t("date.tomorrow")
          : t("date.in_days", { n: next.daysFromNow });

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"
      >
        <IconByKey name={resolveDateIconKey(date.icon)} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{importantDateTitle(t, date)}</p>
        <p className="text-xs text-fg-muted tabular-nums">
          {formatDate(next ? next.iso : date.date, lang)}
          {daysLabel && ` · ${daysLabel}`}
          {ageLine && ` · ${ageLine}`}
        </p>
        {date.description && (
          <p className="mt-1 text-xs text-fg-muted">{date.description}</p>
        )}
      </div>
      <span className="hidden shrink-0 text-xs text-fg-muted sm:inline">
        {t(`enums.person.kinds.${date.kind}`)}
      </span>
      <button
        type="button"
        className="btn-icon btn-icon-danger"
        aria-label={t("common.delete")}
        title={t("common.delete")}
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function ReminderRow({
  reminder,
  onComplete,
  onDelete,
}: {
  reminder: Reminder;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useTranslation();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"
      >
        <IconByKey name={reminder.completed ? "toast-success" : "bell"} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{reminder.title}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-fg-muted">
          <span className="tabular-nums" title={formatDateTime(reminder.remind_at, lang)}>
            {formatRelative(reminder.remind_at, lang)}
          </span>
          {reminder.recur !== "none" && (
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="size-3.5" aria-hidden="true" />
              {t(`enums.reminder.recurrence.${reminder.recur}`)}
            </span>
          )}
        </p>
        {reminder.message && <p className="mt-1 text-xs text-fg-muted">{reminder.message}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!reminder.completed && (
          <button
            type="button"
            className="btn-icon"
            onClick={onComplete}
            aria-label={t("reminder.completed")}
            title={t("reminder.completed")}
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={onDelete}
          aria-label={t("common.delete")}
          title={t("common.delete")}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

interface AddDateModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: ImportantDateCreate) => Promise<void>;
}

function AddDateModal({ open, onClose, onAdd }: AddDateModalProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<DateKind>("custom");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_DATE_ICON);
  const [birthYear, setBirthYear] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !date) return;
    setBusy(true);
    try {
      await onAdd({
        kind,
        title: title.trim(),
        description: description.trim(),
        date,
        icon,
        birth_year: kind === "birthday" && birthYear ? Number(birthYear) : null,
      });
      setTitle("");
      setDescription("");
      setDate("");
      setIcon(DEFAULT_DATE_ICON);
      setBirthYear("");
      setKind("custom");
    } catch {
      // parent toasted
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("date.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={submit}
            disabled={busy || !title.trim() || !date}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.kind")}
          </span>
          <select
            className="neo-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as DateKind)}
          >
            {DATE_KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`enums.person.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.fields.title")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            className="neo-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.fields.date")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            type="date"
            className="neo-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {kind === "birthday" && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {t("date.birth_year")}
            </span>
            <input
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              className="neo-input"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.icon")}
          </span>
          <div role="group" aria-label={t("date.icon")} className="flex flex-wrap gap-1.5">
            {DATE_ICON_KEYS.map((key) => {
              const selected = icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t(`date.icon_names.${key}`)}
                  title={t(`date.icon_names.${key}`)}
                  onClick={() => setIcon(key)}
                  className={`flex size-8 items-center justify-center rounded-md border transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-primary bg-primary-soft text-primary-soft-fg"
                      : "border-border bg-surface text-fg-muted hover:bg-muted hover:text-fg"
                  }`}
                >
                  <IconByKey name={key} className="size-4" />
                </button>
              );
            })}
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.fields.description")}
          </span>
          <textarea
            className="neo-input min-h-16"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}

interface AddReminderModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: ReminderCreate) => Promise<void>;
}

function AddReminderModal({ open, onClose, onAdd }: AddReminderModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [recur, setRecur] = useState<Recurrence>("none");
  const [leadMinutes, setLeadMinutes] = useState("0");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !remindAt) return;
    setBusy(true);
    try {
      await onAdd({
        title: title.trim(),
        remind_at: new Date(remindAt).toISOString(),
        recur,
        lead_minutes: Number(leadMinutes) || 0,
        message: message.trim(),
      });
      setTitle("");
      setRemindAt("");
      setRecur("none");
      setLeadMinutes("0");
      setMessage("");
    } catch {
      // parent toasted
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("reminder.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={submit}
            disabled={busy || !title.trim() || !remindAt}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.fields.title")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            className="neo-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.remind_at")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            type="datetime-local"
            className="neo-input"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.recurrence")}
          </span>
          <select
            className="neo-input"
            value={recur}
            onChange={(e) => setRecur(e.target.value as Recurrence)}
          >
            {RECUR_KEYS.map((r) => (
              <option key={r} value={r}>
                {t(`enums.reminder.recurrence.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.lead_minutes")}
          </span>
          <input
            type="number"
            min={0}
            className="neo-input"
            value={leadMinutes}
            onChange={(e) => setLeadMinutes(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("reminder.message")}
          </span>
          <textarea
            className="neo-input min-h-16"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}