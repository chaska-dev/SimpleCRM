/**
 * PersonsToolbar — search + tag + sort + cadence + clear.
 *
 * Stateless. The parent debounces the search and triggers the refetch.
 * Filter bar (spec 6.3): `flex flex-wrap items-center gap-2`, with no visible labels
 * next to the selects (they carry aria-label).
 *
 * cadence_status is multi-select (toggleable chips) — the backend only
 * accepts a single value per query param, so the parent will filter client-side
 * when more than one is selected (see PersonsListView).
 */
import { Check, Star, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { CadenceStatus, Tag } from "../../types";

export const SORT_KEYS = ["name_asc", "last_contacted"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const CADENCE_OPTIONS: CadenceStatus[] = [
  "overdue",
  "due_soon",
  "unknown",
  "ok",
  "no_cadence",
];

export interface PersonsFilters {
  search: string;
  tag: number | null;
  cadence_status: CadenceStatus[];
  sort: SortKey;
  /**
   * Favorites filter:
   * - null: both
   * - true: favorites only
   * - false: non-favorites only
   * If the page is opened with `initialFavoriteFilter`, it sets it on mount.
   */
  favorite: boolean | null;
}

export const EMPTY_FILTERS: PersonsFilters = {
  search: "",
  tag: null,
  cadence_status: [],
  sort: "name_asc",
  favorite: null,
};

// Filter chips: same height as the small buttons (h-8).
const CHIP_BASE =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-transparent bg-primary-soft text-primary-soft-fg";
const CHIP_OFF = "border-border bg-surface text-fg-muted hover:bg-muted hover:text-fg";

interface Props {
  filters: PersonsFilters;
  tags: Tag[];
  onChange: (next: PersonsFilters) => void;
}

export default function PersonsToolbar({ filters, tags, onChange }: Props) {
  const { t } = useTranslation();

  const setSearch = (search: string) => onChange({ ...filters, search });
  const setTag = (tag: number | null) => onChange({ ...filters, tag });
  const setSort = (sort: SortKey) => onChange({ ...filters, sort });
  const toggleFavorite = () => {
    const next = filters.favorite === true ? null : true;
    onChange({ ...filters, favorite: next });
  };
  const toggleCadence = (cs: CadenceStatus) => {
    const has = filters.cadence_status.includes(cs);
    onChange({
      ...filters,
      cadence_status: has
        ? filters.cadence_status.filter((c) => c !== cs)
        : [...filters.cadence_status, cs],
    });
  };
  const clear = () =>
    onChange({
      search: "",
      tag: null,
      cadence_status: [],
      sort: "name_asc",
      favorite: null,
    });

  const hasActiveFilters =
    filters.search !== "" ||
    filters.tag !== null ||
    filters.cadence_status.length > 0 ||
    filters.sort !== "name_asc" ||
    filters.favorite !== null;

  return (
    <div className="space-y-3">
      {/* Row 1: search + selects + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="persons-search" className="sr-only">
          {t("common.search")}
        </label>
        <input
          id="persons-search"
          type="search"
          value={filters.search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("person.search_placeholder")}
          autoComplete="off"
          className="neo-input w-full sm:max-w-xs sm:flex-1"
        />

        <select
          value={filters.tag === null ? "" : String(filters.tag)}
          onChange={(e) => setTag(e.target.value === "" ? null : Number(e.target.value))}
          aria-label={t("person.filter_tag")}
          className="neo-input w-auto"
        >
          <option value="">{t("person.filter_all_tags")}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>

        <select
          value={filters.sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label={t("person.sort_by")}
          className="neo-input w-auto"
        >
          <option value="name_asc">{t("person.sort_name_asc")}</option>
          <option value="last_contacted">{t("person.sort_last_contacted")}</option>
        </select>

        {hasActiveFilters && (
          <button type="button" onClick={clear} className="neo-btn neo-btn-ghost ml-auto">
            <X className="size-4" aria-hidden="true" />
            <span>{t("person.clear_filters")}</span>
          </button>
        )}
      </div>

      {/* Row 2: favorites + cadence (multi-select) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleFavorite}
          aria-pressed={filters.favorite === true}
          className={[CHIP_BASE, filters.favorite === true ? CHIP_ON : CHIP_OFF].join(" ")}
        >
          {filters.favorite === true ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Star className="size-3.5" aria-hidden="true" />
          )}
          <span>{t("person.favorites_title")}</span>
        </button>
        <span className="ml-2 text-xs font-medium text-fg-muted">{t("person.filter_cadence")}</span>
        {CADENCE_OPTIONS.map((cs) => {
          const active = filters.cadence_status.includes(cs);
          return (
            <button
              key={cs}
              type="button"
              onClick={() => toggleCadence(cs)}
              aria-pressed={active}
              className={[CHIP_BASE, active ? CHIP_ON : CHIP_OFF].join(" ")}
            >
              {t(`enums.cadence_status.${cs}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
