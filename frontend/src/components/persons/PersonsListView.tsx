/**
 * PersonsListView — main island for /persons/ and /favorites/.
 *
 * - Loads `/api/persons/?search=&tag=` on mount and when filters change.
 *   (The backend only supports one `cadence_status` per query; when several are
 *    selected we filter them client-side over the full list.)
 * - Sort is also client-side (backend does not expose order_by yet).
 * - Grid/list toggle persisted in `localStorage.persons_view` (default grid).
 * - Separate empty states: no people vs filters with no matches.
 * - Primary action "New person" in the header → /persons/new/.
 *
 * Search input is debounced 200ms before the refetch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Users, Search, LayoutGrid, List, RefreshCw, Upload } from "lucide-react";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { useTranslation, withLang } from "../../i18n";
import type { CadenceStatus, Lang, PersonListItem, Tag } from "../../types";
import PersonCard from "./PersonCard";
import PersonsToolbar, { EMPTY_FILTERS, type PersonsFilters, type SortKey } from "./PersonsToolbar";
import { LoadingSwap, PersonCardSkeleton, PersonListRowSkeleton, SkeletonGroup } from "../ui";
import EmptyState from "../ui/EmptyState";
import { markedContactedNow, replacePerson } from "../dashboard/dashboard-data";

const SKELETON_COUNT = 6;

const VIEW_STORAGE_KEY = "persons_view";
type ViewMode = "grid" | "list";

function readStoredView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function persistView(v: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  } catch {
    /* no localStorage: the view is not remembered */
  }
}

function sortPersons(list: PersonListItem[], sort: SortKey): PersonListItem[] {
  const copy = [...list];
  switch (sort) {
    case "name_asc": {
      copy.sort((a, b) => {
        const la = (a.last_name || "").localeCompare(b.last_name || "", undefined, {
          sensitivity: "base",
        });
        if (la !== 0) return la;
        return (a.first_name || "").localeCompare(b.first_name || "", undefined, {
          sensitivity: "base",
        });
      });
      return copy;
    }
    case "last_contacted": {
      // "Most forgotten first": nulls (never contacted) first, then by
      // ascending date (oldest first).
      copy.sort((a, b) => {
        if (!a.last_contacted_at && !b.last_contacted_at) return 0;
        if (!a.last_contacted_at) return -1;
        if (!b.last_contacted_at) return 1;
        return new Date(a.last_contacted_at).getTime() - new Date(b.last_contacted_at).getTime();
      });
      return copy;
    }
  }
}

export interface PersonsListViewProps {
  /**
   * If provided, the list starts with `filters.favorite = true|false`
   * pre-applied (the backend honors it via the owner+favorite index).
   * Useful for /favorites/.
   */
  initialFavoriteFilter?: boolean;
  /** Page title (default: "People"). /favorites/ passes its own. */
  title?: string;
  /** Server language (used by `withLang`). */
  lang?: Lang;
}

function PersonsListView({ initialFavoriteFilter, title }: PersonsListViewProps) {
  const { t } = useTranslation();
  // Grid/list view: starts as "grid" (same as the SSR) and is read from
  // localStorage after mounting, so hydration does not break.
  const [view, setViewState] = useState<ViewMode>("grid");
  useEffect(() => {
    setViewState(readStoredView());
  }, []);
  // Only animates (fade-in) after a manual view change, not on initial load.
  const [viewSwitched, setViewSwitched] = useState(false);
  const setView = (next: ViewMode) => {
    if (next !== view) setViewSwitched(true);
    setViewState(next);
    persistView(next);
  };
  const [filters, setFilters] = useState<PersonsFilters>({
    ...EMPTY_FILTERS,
    favorite: initialFavoriteFilter ?? null,
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [persons, setPersons] = useState<PersonListItem[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce of the search.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(filters.search), 200);
    return () => window.clearTimeout(handle);
  }, [filters.search]);

  // Load tags only once (they do not depend on filters).
  useEffect(() => {
    let cancelled = false;
    apiFetch<Tag[]>("/api/tags/")
      .then((data) => {
        if (!cancelled) setTags(data);
      })
      .catch(() => {
        // Tags are optional for the filter; do not break the list if it fails.
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Main fetch. Depends on search/tag (server-side).
  // Sort/cadence_status are applied client-side.
  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setError(null);
    setPersons(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.tag !== null) params.set("tag", String(filters.tag));
    if (filters.favorite !== null) params.set("favorite", filters.favorite ? "true" : "false");

    // We only send cadence_status if exactly one is selected;
    // multi-select is filtered client-side (the backend accepts only one).
    if (filters.cadence_status.length === 1) {
      params.set("cadence_status", filters.cadence_status[0]);
    }

    const qs = params.toString();
    try {
      const data = await apiFetch<PersonListItem[]>(
        `/api/persons/${qs ? `?${qs}` : ""}`,
        { signal: ctrl.signal },
      );
      setPersons(data);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      const msg = e instanceof ApiError ? e.detail : (e as Error).message;
      setError(msg || t("person.error_loading"));
    }
  }, [debouncedSearch, filters.tag, filters.favorite, filters.cadence_status.length, t]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Apply client-side filters (multi cadence) + sort.
  const visiblePersons = useMemo(() => {
    if (persons === null) return null;
    let list = persons;
    if (filters.cadence_status.length > 1) {
      list = list.filter((p) => filters.cadence_status.includes(p.cadence_status));
    }
    return sortPersons(list, filters.sort);
  }, [persons, filters.cadence_status, filters.sort]);

  // Local optimistic update: only that person changes; no refetch or skeleton.
  const handleMarkContacted = useCallback(
    async (person: PersonListItem) => {
      if (markingId !== null) return;
      setMarkingId(person.id);
      const previous = person;
      const optimistic = markedContactedNow(person);
      setPersons((prev) => (prev ? replacePerson(prev, optimistic) : prev));
      try {
        await apiFetch(`/api/persons/${person.id}/mark-contacted/`, {
          method: "POST",
          body: { occurred_at: optimistic.last_contacted_at, kind: "call" },
        });
        toast.success(t("person.marked_contacted_toast"));
      } catch (e) {
        // Revert only that person.
        setPersons((prev) => (prev ? replacePerson(prev, previous) : prev));
        const msg = e instanceof ApiError ? e.detail : (e as Error).message;
        toast.error(msg || t("messages.error_generic"));
      } finally {
        setMarkingId(null);
      }
    },
    [markingId, t],
  );

  const isFirstLoad = persons === null && error === null;
  const hasFilters =
    filters.search !== "" ||
    filters.tag !== null ||
    filters.cadence_status.length > 0 ||
    filters.sort !== "name_asc" ||
    filters.favorite !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-xl font-semibold">{title ?? t("person.title_plural")}</h1>
          {persons !== null && (
            <span className="text-sm text-fg-muted tabular-nums">{persons.length}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle */}
          <div role="group" aria-label={t("view.grid")} className="inline-flex rounded-md bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              aria-label={t("person.view_grid")}
              title={t("person.view_grid")}
              className={[
                "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "grid" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              aria-label={t("person.view_list")}
              title={t("person.view_list")}
              className={[
                "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "list" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>

          <a href="/settings/?tab=import" className="neo-btn no-underline">
            <Upload className="size-4" aria-hidden="true" />
            <span>{t("person.import_button")}</span>
          </a>

          <a href="/persons/new/" className="neo-btn neo-btn-primary no-underline">
            <Plus className="size-4" aria-hidden="true" />
            <span>{t("person.add_person")}</span>
          </a>
        </div>
      </div>

      {/* Toolbar */}
      <PersonsToolbar filters={filters} tags={tags} onChange={setFilters} />

      {/* Loading / error / list */}
      <LoadingSwap
        loading={isFirstLoad}
        skeleton={
          <SkeletonGroup label={t("common.loading")}>
            {view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <PersonCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="neo-card divide-y divide-border overflow-hidden">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <PersonListRowSkeleton key={i} />
                ))}
              </div>
            )}
          </SkeletonGroup>
        }
      >
        {error !== null && (
          <div className="neo-card space-y-4 p-5 text-center">
            <p className="text-sm font-medium text-accent">{error}</p>
            <button type="button" onClick={() => void refetch()} className="neo-btn">
              <RefreshCw className="size-4" aria-hidden="true" />
              <span>{t("person.retry")}</span>
            </button>
          </div>
        )}

        {/* List / grid */}
        {visiblePersons !== null && !error && (
          <div key={view} className={viewSwitched ? "fade-in" : undefined}>
            {visiblePersons.length === 0 ? (
              <div className="neo-card">
                {(persons?.length ?? 0) === 0 && !hasFilters ? (
                  // Empty state: there were never any people.
                  <EmptyState
                    icon={Users}
                    title={t("person.empty")}
                    action={
                      <a href="/persons/new/" className="neo-btn neo-btn-sm neo-btn-primary no-underline">
                        <Plus className="size-4" aria-hidden="true" />
                        <span>{t("person.empty_cta")}</span>
                      </a>
                    }
                  />
                ) : (
                  // Empty state: filters with no matches.
                  <EmptyState icon={Search} title={t("person.no_results_filter")} />
                )}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visiblePersons.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onMarkContacted={handleMarkContacted}
                    busy={markingId === person.id}
                  />
                ))}
              </div>
            ) : (
              <div className="neo-card divide-y divide-border overflow-hidden">
                {visiblePersons.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onMarkContacted={handleMarkContacted}
                    busy={markingId === person.id}
                    variant="row"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </LoadingSwap>
    </div>
  );
}

// Re-export of the cadence_status type to keep types in sync.
export type { CadenceStatus };

export default withLang(PersonsListView);
