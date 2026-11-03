/**
 * RemindersView — React island for /reminders/.
 *
 * Two views (List | Board segmented control, remembered in localStorage):
 * - List: segmented control (Pending | Completed | All) that maps to
 *   `?completed=true|false|null`.
 * - Board: Pending / In progress / Done columns (see RemindersBoard).
 * - Extra dropdown filter by person_id (applies to both views).
 * - CRUD: create (modal), edit (modal), complete (toast + interaction if yearly+person),
 *   delete (confirm modal).
 *
 * Fetching pattern: one query per tab/filter change. We cancel the previous
 * request when a new one starts (AbortController) to avoid race conditions
 * when the user switches tabs quickly.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, Columns3, List, Plus } from "lucide-react";
import type { Lang, PersonListItem, Reminder, ReminderCreate, ReminderStatus } from "../../types";
import { useTranslation, withLang } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import ReminderRow from "./ReminderRow";
import ReminderFormModal from "./ReminderFormModal";
import RemindersBoard, { DONE_LIMIT } from "./RemindersBoard";
import ConfirmModal from "../ui/ConfirmModal";
import { KanbanBoardSkeleton, LoadingSwap, ReminderRowSkeleton } from "../ui";
import SegmentedControl from "../ui/SegmentedControl";
import EmptyState from "../ui/EmptyState";

const SKELETON_COUNT = 5;

type Tab = "pending" | "completed" | "all";
type View = "list" | "board";

const VIEW_STORAGE_KEY = "reminders_view";

interface RemindersViewProps {
  lang: Lang;
}

function buildQuery(tab: Tab, personId: number | ""): string {
  const params = new URLSearchParams();
  if (tab === "pending") params.set("completed", "false");
  else if (tab === "completed") params.set("completed", "true");
  // "all" → no completed filter
  if (personId !== "") params.set("person_id", String(personId));
  const qs = params.toString();
  return qs ? `/api/reminders/?${qs}` : "/api/reminders/";
}

/** Board: open items (todo + in progress) and the last DONE_LIMIT done items. */
function boardQueries(personId: number | ""): [string, string] {
  const person = personId !== "" ? `&person_id=${personId}` : "";
  return [
    `/api/reminders/?completed=false${person}`,
    `/api/reminders/?status=done&ordering=-updated_at&limit=${DONE_LIMIT}${person}`,
  ];
}

async function fetchForView(
  view: View,
  tab: Tab,
  personId: number | "",
  signal?: AbortSignal,
): Promise<Reminder[]> {
  if (view === "board") {
    const [openUrl, doneUrl] = boardQueries(personId);
    const [open, done] = await Promise.all([
      apiFetch<Reminder[]>(openUrl, { signal }),
      apiFetch<Reminder[]>(doneUrl, { signal }),
    ]);
    return [...open, ...done];
  }
  return apiFetch<Reminder[]>(buildQuery(tab, personId), { signal });
}

function readStoredView(): View {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

function RemindersView(_props: RemindersViewProps) {
  const { t } = useTranslation();

  // === State ===
  // null until localStorage is read on the client (avoids hydration mismatch).
  const [view, setViewState] = useState<View | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [personFilter, setPersonFilter] = useState<number | "">("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [persons, setPersons] = useState<PersonListItem[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);
  const [loadingPersons, setLoadingPersons] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Reminder | null>(null);

  // Lookup map so each ReminderRow does not re-render the parent when persons change.
  const personById = useMemo(() => {
    const m = new Map<number, PersonListItem>();
    for (const p of persons) m.set(p.id, p);
    return m;
  }, [persons]);

  useEffect(() => {
    setViewState(readStoredView());
  }, []);

  // Link from the home page ("New reminder"): /reminders/?new=1 opens the form.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("new")) return;
    setEditing(null);
    setFormOpen(true);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const setView = (next: View) => {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* no localStorage: the view is not remembered */
    }
  };

  // === Fetch reminders ===
  useEffect(() => {
    if (view === null) return;
    const controller = new AbortController();
    setLoadingReminders(true);
    setError(null);
    fetchForView(view, tab, personFilter, controller.signal)
      .then((data) => {
        setReminders(data);
        setLoadingReminders(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("messages.error_generic"));
        setLoadingReminders(false);
      });
    return () => controller.abort();
  }, [view, tab, personFilter, t]);

  // === Fetch persons (once + reload on change). ===
  useEffect(() => {
    const controller = new AbortController();
    setLoadingPersons(true);
    apiFetch<PersonListItem[]>("/api/persons/", { signal: controller.signal })
      .then((data) => {
        setPersons(data);
        setLoadingPersons(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Not blocking: the person filter simply stays empty.
        setLoadingPersons(false);
      });
    return () => controller.abort();
  }, []);

  // === Handlers ===

  const refreshReminders = useCallback(async () => {
    try {
      const data = await fetchForView(view ?? "list", tab, personFilter);
      setReminders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("messages.error_generic"));
    }
  }, [view, tab, personFilter, t]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (r: Reminder) => {
    setEditing(r);
    setFormOpen(true);
  };

  const handleSave = async (data: ReminderCreate): Promise<void> => {
    try {
      if (editing) {
        const updated = await apiFetch<Reminder>(`/api/reminders/${editing.id}/`, {
          method: "PATCH",
          body: data,
        });
        toast.success(t("reminder.saved_toast"));
        setFormOpen(false);
        setEditing(null);
        // Local replacement (and out of the list if it no longer matches the person filter).
        setReminders((prev) =>
          prev.flatMap((r) => {
            if (r.id !== updated.id) return [r];
            return personFilter !== "" && updated.person !== personFilter ? [] : [updated];
          }),
        );
      } else {
        const created = await apiFetch<Reminder>("/api/reminders/", {
          method: "POST",
          body: data,
        });
        toast.success(t("reminder.created_toast"));
        setFormOpen(false);
        setEditing(null);
        // Insert if it passes the active filter, otherwise refresh.
        const matchesTab =
          view === "board" ||
          (tab === "pending" && !created.completed) ||
          (tab === "completed" && created.completed) ||
          tab === "all";
        const matchesPerson = personFilter === "" || created.person === personFilter;
        if (matchesTab && matchesPerson) {
          setReminders((prev) => [...prev, created]);
        } else {
          await refreshReminders();
        }
      }
    } catch (err) {
      // The modal shows the error inline.
      if (err instanceof ApiError) throw new Error(err.detail);
      throw err;
    }
  };

  const handleComplete = async (r: Reminder): Promise<void> => {
    try {
      await apiFetch<Reminder>(`/api/reminders/${r.id}/complete/`, {
        method: "POST",
        body: {},
      });
      toast.success(t("reminder.completed_toast"));
      if (r.recur === "yearly" && r.person != null) {
        toast.info(t("reminder.interaction_logged_toast"));
      }
      // If we are on tab=pending, the reminder disappears; otherwise it stays visible with completed=true.
      if (tab === "pending") {
        setReminders((prev) => prev.filter((x) => x.id !== r.id));
      } else {
        setReminders((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, completed: true, status: "done" } : x)),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("messages.error_generic");
      toast.error(msg);
    }
  };

  /**
   * Move a board card: optimistic update, then API.
   * - to "Done": POST /complete/; from "Done": PATCH {status, completed:false};
   * - on failure, only that card is reverted and a toast is shown.
   */
  const handleMove = async (r: Reminder, status: ReminderStatus): Promise<void> => {
    if (r.status === status) return;
    const nowIso = new Date().toISOString();
    setReminders((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status, completed: status === "done", updated_at: nowIso } : x,
      ),
    );
    try {
      let updated: Reminder;
      if (status === "done") {
        updated = await apiFetch<Reminder>(`/api/reminders/${r.id}/complete/`, {
          method: "POST",
          body: {},
        });
        if (r.recur === "yearly" && r.person != null) {
          toast.info(t("reminder.interaction_logged_toast"));
        }
      } else {
        updated = await apiFetch<Reminder>(`/api/reminders/${r.id}/`, {
          method: "PATCH",
          body: r.status === "done" ? { status, completed: false } : { status },
        });
      }
      setReminders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setReminders((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    }
  };

  const handleDelete = async (r: Reminder): Promise<void> => {
    setConfirmDelete(null);
    try {
      await apiFetch<void>(`/api/reminders/${r.id}/`, { method: "DELETE" });
      toast.success(t("messages.deleted"));
      setReminders((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("messages.error_generic");
      toast.error(msg);
    }
  };

  // === Derived ===
  const empty = !loadingReminders && reminders.length === 0;

  return (
    <div className="space-y-6">
      {/* Header: title + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("reminder.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<View>
            ariaLabel={t("reminder.view.label")}
            value={view ?? "list"}
            onChange={setView}
            options={[
              {
                key: "list",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <List className="size-4" aria-hidden="true" />
                    {t("reminder.view.list")}
                  </span>
                ),
              },
              {
                key: "board",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Columns3 className="size-4" aria-hidden="true" />
                    {t("reminder.view.board")}
                  </span>
                ),
              },
            ]}
          />
          <button type="button" onClick={openCreate} className="neo-btn neo-btn-primary">
            <Plus className="size-4" aria-hidden="true" />
            <span>{t("reminder.add")}</span>
          </button>
        </div>
      </div>

      {/* Filter bar: segmented (list only) + person */}
      <div className="flex flex-wrap items-center gap-2">
        {view !== "board" && (
          <SegmentedControl<Tab>
            ariaLabel={t("reminder.title")}
            value={tab}
            onChange={setTab}
            options={[
              { key: "pending", label: t("reminder.tabs.pending") },
              { key: "completed", label: t("reminder.tabs.completed") },
              { key: "all", label: t("reminder.tabs.all") },
            ]}
          />
        )}

        {(reminders.length > 0 || personFilter !== "") && (
          <select
            value={personFilter}
            onChange={(e) => {
              const v = e.target.value;
              setPersonFilter(v === "" ? "" : Number(v));
            }}
            disabled={loadingPersons}
            aria-label={t("reminder.filter_by_person")}
            className="neo-input w-auto"
          >
            <option value="">{t("reminder.all_people")}</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content: list or board */}
      <LoadingSwap
        loading={loadingReminders}
        label={t("common.loading")}
        skeleton={
          view === "board" ? (
            <KanbanBoardSkeleton />
          ) : (
            <ul className="neo-card divide-y divide-border overflow-hidden">
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <ReminderRowSkeleton key={i} />
              ))}
            </ul>
          )
        }
      >
      {error ? (
        <div role="alert" className="space-y-3 rounded-lg bg-status-overdue px-4 py-3 text-status-overdue-fg">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
          <button type="button" onClick={refreshReminders} className="neo-btn neo-btn-sm">
            {t("common.confirm")}
          </button>
        </div>
      ) : view === "board" ? (
        <RemindersBoard
          reminders={reminders}
          personById={personById}
          onMove={handleMove}
          onEdit={openEdit}
          onDelete={setConfirmDelete}
        />
      ) : empty ? (
        <div className="neo-card">
          <EmptyState
            icon={Bell}
            title={t("reminder.title")}
            description={t(tab === "pending" ? "reminder.empty.pending" : "reminder.empty.completed")}
            action={
              tab === "pending" ? (
                <button type="button" onClick={openCreate} className="neo-btn neo-btn-sm neo-btn-primary">
                  <Plus className="size-4" aria-hidden="true" />
                  <span>{t("reminder.add")}</span>
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="neo-card divide-y divide-border overflow-hidden">
          {reminders.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              personById={personById}
              onComplete={handleComplete}
              onEdit={openEdit}
              onDelete={setConfirmDelete}
            />
          ))}
        </ul>
      )}
      </LoadingSwap>

      {/* Modals */}
      <ReminderFormModal
        open={formOpen}
        reminder={editing}
        persons={persons}
        onSave={handleSave}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmModal
        open={confirmDelete !== null}
        title={t("common.delete")}
        message={t("reminder.delete_confirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (confirmDelete) void handleDelete(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

export default withLang(RemindersView);
