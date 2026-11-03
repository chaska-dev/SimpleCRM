/**
 * OrganizationsListView — React island for /organizations/.
 *
 * Header with count + "New organization", filter bar (search and
 * type) and card grid. Fetch on each filter change with AbortController;
 * search is debounced.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Building2, Plus } from "lucide-react";
import type { Lang, Organization, OrganizationKind } from "../../types";
import { useTranslation, withLang } from "../../i18n";
import { apiFetch } from "../../lib/api";
import { LoadingSwap, OrganizationCardSkeleton } from "../ui";
import EmptyState from "../ui/EmptyState";
import AiMark from "../ui/AiMark";
import OrgLogo from "./OrgLogo";
import { ORGANIZATION_KINDS } from "./organizationUtils";

interface Props {
  lang: Lang;
}

const SKELETON_COUNT = 6;

function OrganizationsListView(_props: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<OrganizationKind | "">("");
  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (kind) params.set("kind", kind);
    const qs = params.toString();
    apiFetch<Organization[]>(`/api/organizations/${qs ? `?${qs}` : ""}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("messages.error_generic"));
        setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, kind, t]);

  const filtered = debounced !== "" || kind !== "";
  const newButton = (small: boolean) => (
    <a
      href="/organizations/new/"
      className={`neo-btn ${small ? "neo-btn-sm " : ""}neo-btn-primary no-underline`}
    >
      <Plus className="size-4" aria-hidden="true" />
      <span>{t("organization.add")}</span>
    </a>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{t("organization.title")}</h1>
          {!loading && !error && (
            <span className="text-sm text-fg-muted tabular-nums">{items.length}</span>
          )}
        </div>
        {newButton(false)}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("organization.search_placeholder")}
          aria-label={t("common.search")}
          autoComplete="off"
          className="neo-input w-full sm:max-w-xs sm:flex-1"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as OrganizationKind | "")}
          aria-label={t("organization.filter_kind")}
          className="neo-input w-auto"
        >
          <option value="">{t("organization.all_kinds")}</option>
          {ORGANIZATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`enums.organization.kind.${k}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <LoadingSwap
        loading={loading}
        label={t("common.loading")}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <OrganizationCardSkeleton key={i} />
            ))}
          </div>
        }
      >
      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-status-overdue px-4 py-3 text-status-overdue-fg"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="neo-card">
          <EmptyState
            icon={Building2}
            title={t(filtered ? "common.no_results" : "organization.empty.title")}
            description={t(
              filtered ? "organization.empty.no_results" : "organization.empty.description",
            )}
            action={filtered ? undefined : newButton(true)}
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((org) => (
            <li key={org.id}>
              <a
                href={`/organizations/${org.id}/`}
                className="neo-card neo-card-hover flex items-center gap-3 p-5 text-fg no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <OrgLogo org={org} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{org.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[t(`enums.organization.kind.${org.kind}`), org.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="block text-xs text-fg-muted tabular-nums">
                    {t("organization.member_count", { count: org.member_count })}
                  </span>
                  <AiMark createdVia={org.created_via} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      </LoadingSwap>
    </div>
  );
}

export default withLang(OrganizationsListView);
