/**
 * OrganizationDetailView — React island for /organizations/[id]/.
 *
 * Header (logo, name, type and city; Edit and More menu with Delete) and
 * three tabs: Information, People, Photos and files. The active tab is
 * synced with the URL hash. 404 redirects to /organizations/.
 */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import type { Lang, Organization } from "../../types";
import { useTranslation, withLang } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import Tabs from "../ui/Tabs";
import AiMark from "../ui/AiMark";
import TagPill from "../ui/TagPill";
import { LoadingSwap, OrganizationDetailSkeleton } from "../ui";
import ConfirmModal from "../ui/ConfirmModal";
import OrgLogo from "./OrgLogo";
import EditOrganizationModal from "./EditOrganizationModal";
import OrganizationMembersTab from "./OrganizationMembersTab";
import OrganizationFilesTab from "./OrganizationFilesTab";
import { fullAddress, mapsUrl } from "./organizationUtils";

type TabKey = "info" | "people" | "files";
const TAB_KEYS: TabKey[] = ["info", "people", "files"];

function parseHashTab(): TabKey {
  if (typeof window === "undefined") return "info";
  const raw = window.location.hash.replace(/^#/, "");
  return (TAB_KEYS as string[]).includes(raw) ? (raw as TabKey) : "info";
}

interface Props {
  organizationId: string;
  initialLang?: Lang;
}

function OrganizationDetailView({ organizationId }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("info");
  const [org, setOrg] = useState<Organization | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const redirectedRef = useRef(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Initial tab from the hash (on the client, after hydration) and back/forward.
  useEffect(() => {
    setTab(parseHashTab());
    const onHash = () => {
      setTabSwitched(true);
      setTab(parseHashTab());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // The tab content enters with .fade-in only after a tab change.
  const [tabSwitched, setTabSwitched] = useState(false);

  const changeTab = (next: TabKey) => {
    setTabSwitched(true);
    setTab(next);
    const url = `${window.location.pathname}${window.location.search}#${next}`;
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    apiFetch<Organization>(`/api/organizations/${organizationId}/`)
      .then((data) => {
        if (cancelled) return;
        setOrg(data);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            toast.warning(t("organization.not_found"));
            window.location.href = "/organizations/";
          }
          return;
        }
        setErrorMsg(e instanceof Error ? e.message : t("messages.error_generic"));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, t]);

  // Close the More menu on outside click or Escape.
  useEffect(() => {
    if (!showMore) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setShowMore(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMore(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMore]);

  const handleDelete = async () => {
    if (!org) return;
    try {
      await apiFetch<void>(`/api/organizations/${org.id}/`, { method: "DELETE" });
      toast.success(t("organization.deleted"));
      window.location.href = "/organizations/";
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : t("messages.error_generic"));
      setShowDelete(false);
    }
  };

  if (status === "error" || (status !== "loading" && !org)) {
    return (
      <div className="neo-card space-y-4 p-5">
        <p className="text-sm font-semibold">{t("organization.load_error")}</p>
        {errorMsg && <p className="text-xs text-fg-muted">{errorMsg}</p>}
        <button
          type="button"
          className="neo-btn neo-btn-primary"
          onClick={() => window.location.reload()}
        >
          {t("common.confirm")}
        </button>
      </div>
    );
  }

  // The detail is built only when there is an organization; while loading, LoadingSwap shows the skeleton.
  const renderDetail = (org: Organization) => {
  const meta = [t(`enums.organization.kind.${org.kind}`), org.city].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <section className="neo-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <OrgLogo org={org} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold">{org.name}</h1>
          {meta && <p className="mt-1 text-sm text-fg-muted">{meta}</p>}
          <AiMark createdVia={org.created_via} className="mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="neo-btn neo-btn-sm" onClick={() => setShowEdit(true)}>
            {t("common.edit")}
          </button>
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className="btn-icon"
              aria-haspopup="menu"
              aria-expanded={showMore}
              aria-label={t("organization.more_actions")}
              title={t("organization.more_actions")}
              onClick={() => setShowMore((v) => !v)}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
            {showMore && (
              <div
                role="menu"
                className="neo-card absolute right-0 z-20 mt-2 min-w-40 rounded-md p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-accent hover:bg-status-overdue"
                  onClick={() => {
                    setShowMore(false);
                    setShowDelete(true);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("common.delete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ TABS ============ */}
      <Tabs<TabKey>
        ariaLabel={org.name}
        idPrefix="organization"
        active={tab}
        onChange={changeTab}
        tabs={TAB_KEYS.map((key) => ({ key, label: t(`organization.tabs.${key}`) }))}
      />

      <section
        id={`organization-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`organization-tab-${tab}`}
        className="neo-card p-5"
      >
        <div key={tab} className={tabSwitched ? "fade-in" : undefined}>
          {tab === "info" && <InfoPanel org={org} />}
          {tab === "people" && <OrganizationMembersTab organizationId={org.id} />}
          {tab === "files" && <OrganizationFilesTab organizationId={org.id} />}
        </div>
      </section>

      <EditOrganizationModal
        open={showEdit}
        organization={org}
        onClose={() => setShowEdit(false)}
        onSaved={(saved) => {
          setOrg(saved);
          setShowEdit(false);
        }}
      />
      <ConfirmModal
        open={showDelete}
        title={t("common.delete")}
        message={t("organization.delete_confirm", { name: org.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
  };

  return (
    <LoadingSwap
      loading={status === "loading"}
      label={t("common.loading")}
      skeleton={<OrganizationDetailSkeleton />}
    >
      {org ? renderDetail(org) : null}
    </LoadingSwap>
  );
}

/** Information tab: shows only fields with a value. */
function InfoPanel({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const place = fullAddress(org);
  const linkClass = "text-primary no-underline hover:underline";

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (place) {
    rows.push({
      label: t("organization.fields.address"),
      value: (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="break-words">{place}</span>
          <a
            href={mapsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs ${linkClass}`}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("organization.info.open_map")}
          </a>
        </div>
      ),
    });
  }
  if (org.phone) {
    rows.push({
      label: t("organization.fields.phone"),
      value: (
        <a href={`tel:${org.phone}`} className={linkClass}>
          {org.phone}
        </a>
      ),
    });
  }
  if (org.email) {
    rows.push({
      label: t("organization.fields.email"),
      value: (
        <a href={`mailto:${org.email}`} className={`break-all ${linkClass}`}>
          {org.email}
        </a>
      ),
    });
  }
  if (org.website) {
    rows.push({
      label: t("organization.fields.website"),
      value: (
        <a
          href={org.website}
          target="_blank"
          rel="noopener noreferrer"
          className={`break-all ${linkClass}`}
        >
          {org.website}
        </a>
      ),
    });
  }
  if (org.notes) {
    rows.push({
      label: t("organization.fields.notes"),
      value: <p className="whitespace-pre-wrap break-words">{org.notes}</p>,
    });
  }
  if (org.tags.length > 0) {
    rows.push({
      label: t("organization.fields.tags"),
      value: (
        <div className="flex flex-wrap gap-2">
          {org.tags.map((tag) => (
            <TagPill key={tag.id} name={tag.name} color={tag.color} />
          ))}
        </div>
      ),
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">{t("organization.info.empty")}</p>;
  }

  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:gap-4"
        >
          <dt className="text-xs font-medium text-fg-muted sm:pt-0.5">{row.label}</dt>
          <dd className="min-w-0 text-sm">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default withLang(OrganizationDetailView);
