/**
 * DashboardView — client:load island for /dashboard.
 *
 * Layout (spec v5 H2):
 *   - Top: QuickLogBar (quick interaction logging).
 *   - `gap-6` grid: mobile 1 column; `md` 2 columns; `lg` 3 columns.
 *       · Row 1 (lg): Calendar (2 columns) + Pending (1 column, same
 *         height as the calendar, internal scroll).
 *       · Row 2 (lg): Favorites, Upcoming dates, Suggestions to contact.
 *     On mobile the order is calendar, pending, favorites, upcoming dates,
 *     suggestions.
 *   - Without data, each card shows its own empty state.
 *
 * Optimistic actions (no reload or skeleton): mark contacted
 * (favorites and suggestions) and complete a reminder. If the request fails,
 * only that change is reverted and a toast is shown.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { useTranslation, withLang } from "../../i18n";
import { DashboardSkeleton, LoadingSwap } from "../ui";
import type { DashboardData, PersonListItem, Reminder } from "../../types";
import {
  markedContactedNow,
  normalizeDashboard,
  replacePerson,
  replaceSuggestionPerson,
  type RawDashboard,
} from "./dashboard-data";
import QuickLogBar from "./QuickLogBar";
import QuickLogModal from "./QuickLogModal";
import CalendarCard from "./CalendarCard";
import FavoritePeopleCard from "./FavoritePeopleCard";
import PendingRemindersCard from "./PendingRemindersCard";
import UpcomingDatesCard from "./UpcomingDatesCard";
import SuggestionsCard from "./SuggestionsCard";

type Status = "loading" | "error" | "ready";

interface Props {
  lang: "es" | "en";
  /**
   * Data fetched SSR-side. If present, used as the initial state (the widgets
   * show up on first paint). If null, the component fetches
   * client-side on mount.
   */
  initialData: DashboardData | null;
}

function DashboardView({ initialData }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>(initialData ? "ready" : "loading");
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [selected, setSelected] = useState<PersonListItem | null>(null);

  const tRef = useRef(t);
  tRef.current = t;
  // Latest version of the state, to revert an optimistic change without relying on stale closures.
  const dataRef = useRef<DashboardData | null>(initialData);
  dataRef.current = data;

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const raw = await apiFetch<RawDashboard>("/api/dashboard/");
      setData(normalizeDashboard(raw));
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setStatus("error");
      toast.error(tRef.current("messages.error_generic"));
    }
  }, []);

  // Only fetched on mount if the SSR did not deliver data; with `initialData` there is no refetch.
  useEffect(() => {
    if (!initialData) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const searchablePeople = useMemo<PersonListItem[]>(() => {
    if (!data) return [];
    return [...data.recent];
  }, [data]);

  // Replaces only that person in the state lists (without reloading the dashboard).
  const patchPerson = useCallback((next: PersonListItem) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            recent: replacePerson(prev.recent, next),
            favorites: replacePerson(prev.favorites, next),
            suggestions: replaceSuggestionPerson(prev.suggestions, next),
          }
        : prev,
    );
  }, []);

  // The modal already did the POST: we only update that person locally.
  const handleLogged = useCallback(
    (person: PersonListItem) => {
      patchPerson(markedContactedNow(person));
    },
    [patchPerson],
  );

  // "Mark contacted" action on rows: optimistic, with rollback on failure.
  // In suggestions the person leaves the list (already contacted).
  const [markingId, setMarkingId] = useState<number | null>(null);
  const handleMarkContacted = useCallback(
    async (person: PersonListItem) => {
      if (markingId !== null) return;
      setMarkingId(person.id);
      const previousSuggestions = dataRef.current?.suggestions ?? [];
      const optimistic = markedContactedNow(person);
      patchPerson(optimistic);
      setData((prev) =>
        prev
          ? { ...prev, suggestions: prev.suggestions.filter((s) => s.person.id !== person.id) }
          : prev,
      );
      try {
        await apiFetch(`/api/persons/${person.id}/mark-contacted/`, {
          method: "POST",
          body: { occurred_at: optimistic.last_contacted_at, kind: "call" },
        });
        toast.success(tRef.current("person.marked_contacted_toast"));
      } catch (e) {
        patchPerson(person);
        setData((prev) => (prev ? { ...prev, suggestions: previousSuggestions } : prev));
        const msg = e instanceof ApiError ? e.detail : (e as Error).message;
        toast.error(msg || tRef.current("messages.error_generic"));
      } finally {
        setMarkingId(null);
      }
    },
    [markingId, patchPerson],
  );

  // Completing a reminder: it leaves "Pending" instantly; if it fails it returns to its place.
  const [completingIds, setCompletingIds] = useState<ReadonlySet<number>>(new Set());
  const handleCompleteReminder = useCallback(async (reminder: Reminder) => {
    if (completingIds.has(reminder.id)) return;
    const previous = dataRef.current;
    setCompletingIds((prev) => new Set(prev).add(reminder.id));
    setData((prev) =>
      prev
        ? {
            ...prev,
            pending_reminders: prev.pending_reminders.filter((r) => r.id !== reminder.id),
            pending_reminders_total: Math.max(0, prev.pending_reminders_total - 1),
          }
        : prev,
    );
    try {
      await apiFetch<Reminder>(`/api/reminders/${reminder.id}/complete/`, {
        method: "POST",
        body: {},
      });
      toast.success(tRef.current("reminder.completed_toast"));
    } catch (e) {
      setData((prev) =>
        prev && previous
          ? {
              ...prev,
              pending_reminders: previous.pending_reminders,
              pending_reminders_total: previous.pending_reminders_total,
            }
          : prev,
      );
      const msg = e instanceof ApiError ? e.detail : (e as Error).message;
      toast.error(msg || tRef.current("messages.error_generic"));
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(reminder.id);
        return next;
      });
    }
  }, [completingIds]);

  // With SSR data (`initialData`) the content is painted immediately, without skeleton or
  // animation. The skeleton only exists when the initial fetch runs on the client; a
  // later refresh (`load` with data already loaded) keeps the content.
  const renderDashboard = (data: DashboardData) => (
    <div className="space-y-6">
      <QuickLogBar people={searchablePeople} onSelect={setSelected} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Row 1: calendar (2 columns) + pending with the same height on lg */}
        <div className="md:col-span-2">
          <CalendarCard events={data.calendar} />
        </div>
        <div className="relative">
          <PendingRemindersCard
            reminders={data.pending_reminders}
            onComplete={handleCompleteReminder}
            busyIds={completingIds}
          />
        </div>

        {/* Row 2: favorites, upcoming dates, suggestions */}
        <FavoritePeopleCard
          people={data.favorites}
          onMarkContacted={handleMarkContacted}
          busyId={markingId}
        />
        <UpcomingDatesCard events={data.upcoming_events} />
        <SuggestionsCard
          suggestions={data.suggestions}
          onMarkContacted={handleMarkContacted}
          busyId={markingId}
        />
      </div>

      {selected && (
        <QuickLogModal
          person={selected}
          onClose={() => setSelected(null)}
          onLogged={() => {
            setSelected(null);
            handleLogged(selected);
          }}
        />
      )}
    </div>
  );

  const errorCard = (
    <div className="neo-card space-y-4 p-5">
      <p className="text-sm font-semibold">{t("messages.error_generic")}</p>
      {errorMessage && <p className="break-words text-xs text-fg-muted">{errorMessage}</p>}
      <button type="button" className="neo-btn neo-btn-primary" onClick={load}>
        {t("common.confirm")}
      </button>
    </div>
  );

  return (
    <LoadingSwap
      loading={status === "loading" && !data}
      label={t("common.loading")}
      skeleton={<DashboardSkeleton />}
    >
      {status === "error" || !data ? errorCard : renderDashboard(data)}
    </LoadingSwap>
  );
}

export default withLang(DashboardView);
