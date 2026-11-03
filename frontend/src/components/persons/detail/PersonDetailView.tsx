import { useEffect, useState, useCallback, useRef } from "react";
import { Download, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation, withLang } from "../../../i18n";
import type {
  Person,
  Lang,
  ContactInfo,
  Interaction,
  Note,
  ImportantDate,
  Reminder,
  Attachment,
} from "../../../types";

import Avatar from "../../ui/Avatar";
import AiMark from "../../ui/AiMark";
import Tabs from "../../ui/Tabs";
import TagPill from "../../ui/TagPill";
import CadenceBadge from "./CadenceBadge";
import EditPersonModal from "./EditPersonModal";
import ConfirmModal from "../../ui/ConfirmModal";
import ContactTab from "./ContactTab";
import InteractionsTab from "./InteractionsTab";
import NotesTab from "./NotesTab";
import DatesTab from "./DatesTab";
import AttachmentsTab from "./AttachmentsTab";
import { cadenceStatusKey, displayName, formatDate, formatRelative } from "./helpers";
import { LoadingSwap, PersonDetailSkeleton } from "../../ui";

type TabKey = "contact" | "interactions" | "notes" | "dates" | "attachments";

const TAB_KEYS: TabKey[] = ["contact", "interactions", "notes", "dates", "attachments"];

interface Props {
  personId: string;
  initialLang?: Lang;
}

type Status = "loading" | "error" | "ready";

/**
 * PersonDetailView — React island (client:load).
 *
 * - Fetch on mount: `GET /api/persons/{id}/`. 404 → redirect `/persons/`.
 * - Header with Avatar, name, meta, cadence status, tags and actions.
 * - 5 tabs (state in URL hash). Data is cached in memory: switching tab does NOT
 *   refetch.
 * - `window.location.hash` is kept in sync.
 */
function PersonDetailView({ personId }: Props) {
  const { t, lang } = useTranslation();
  // Lazy initializer: runs only once. In SSR `window === undefined`
  // falls back to "contact". On the client (hydrate) it reads `window.location.hash` so
  // a deep link with `#notes` opens directly on that tab.
  const [tab, setTab] = useState<TabKey>(() => parseHashTab());
  // The tab content enters with .fade-in only after a tab change (not on initial load).
  const [tabSwitched, setTabSwitched] = useState(false);
  const changeTab = useCallback((next: TabKey) => {
    setTabSwitched(true);
    setTab(next);
  }, []);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);

  // Cache of each tab's data. Only loaded when the tab is activated for the
  // first time. Manual refetch possible via refreshKey.
  const [contacts, setContacts] = useState<ContactInfo[] | null>(null);
  const [interactions, setInteractions] = useState<Interaction[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [dates, setDates] = useState<ImportantDate[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);

  // Actions / modals
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const redirectedRef = useRef(false);

  // Sync tab with URL hash (browser back/forward too).
  useEffect(() => {
    const onHashChange = () => {
      const next = parseHashTab();
      setTabSwitched(true);
      setTab(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Initial fetch of the person.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMsg(null);
    apiFetch<Person>(`/api/persons/${personId}/`)
      .then((data) => {
        if (cancelled) return;
        setPerson(data);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            toast.warning(t("person.not_found"));
            window.location.href = "/persons/";
          }
          return;
        }
        const msg = e instanceof Error ? e.message : t("messages.error_generic");
        setErrorMsg(msg);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [personId, t]);

  // Set the hash when the tab changes (if it differs).
  useEffect(() => {
    const expected = `#${tab}`;
    if (window.location.hash !== expected) {
      // replaceState to avoid triggering a recursive hashchange. We preserve
      // `search` in case the URL had query params (?something=…).
      const url = `${window.location.pathname}${window.location.search}${expected}`;
      window.history.replaceState(null, "", url);
    }
  }, [tab]);

  // -------- Person actions --------
  const handleMarkContacted = useCallback(async () => {
    if (!person || busyAction) return;
    setBusyAction("mark");
    try {
      const created = await apiFetch<Interaction>(
        `/api/persons/${person.id}/mark-contacted/`,
        { method: "POST", body: {} },
      );
      // The response is the created Interaction; refetch person to update cadence_status.
      const fresh = await apiFetch<Person>(`/api/persons/${person.id}/`);
      setPerson(fresh);
      setInteractions((cur) => [created, ...(cur ?? [])]);
      toast.success(t("person.mark_contacted_today_done"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("messages.error_generic");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }, [person, busyAction, t]);

  const handleToggleFavorite = useCallback(async () => {
    if (!person || busyAction) return;
    const next = !person.favorite;
    const prev = person;
    // Optimistic
    setPerson({ ...person, favorite: next });
    setBusyAction("favorite");
    try {
      const updated = await apiFetch<{ id: number; favorite: boolean }>(
        `/api/persons/${person.id}/toggle-favorite/`,
        { method: "POST", body: { favorite: next } },
      );
      setPerson((cur) => (cur ? { ...cur, favorite: updated.favorite } : cur));
      toast.success(
        updated.favorite ? t("person.added_to_favorites") : t("person.removed_from_favorites"),
      );
    } catch (e) {
      setPerson(prev);
      const msg = e instanceof Error ? e.message : t("messages.error_generic");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }, [person, busyAction, t]);

  // handleSavePerson: `t` only changes with the language (memoized).
  const handleSavePerson = useCallback((next: Person) => {
    setPerson(next);
    toast.success(t("messages.saved"));
  }, [t]);

  const handleDownloadVcard = useCallback(async () => {
    try {
      const blob = await apiFetchBlob(`/api/persons/${personId}/vcard/`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(person ? displayName(person) : "contact").replace(/[\\/:*?"<>|]+/g, "-")}.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t("person.vcard_error"));
    }
  }, [personId, person, t]);

  const handleDeletePerson = useCallback(async () => {
    if (!person) return;
    setBusyAction("delete");
    try {
      await apiFetch<void>(`/api/persons/${person.id}/`, { method: "DELETE" });
      toast.success(t("messages.person_deleted"));
      window.location.href = "/persons/";
    } catch (e) {
      setBusyAction(null);
      const msg = e instanceof Error ? e.message : t("messages.error_generic");
      toast.error(msg);
    }
  }, [person, t]);

  // -------- Tab data reloaders --------
  const reloadContacts = useCallback(async () => {
    const data = await apiFetch<ContactInfo[]>(
      `/api/persons/${personId}/contacts-info/`,
    );
    setContacts(data);
  }, [personId]);

  const reloadInteractions = useCallback(async () => {
    const data = await apiFetch<Interaction[]>(
      `/api/persons/${personId}/interactions/`,
    );
    setInteractions(data);
  }, [personId]);

  const reloadNotes = useCallback(async () => {
    const data = await apiFetch<Note[]>(`/api/persons/${personId}/notes/`);
    setNotes(data);
  }, [personId]);

  const reloadDates = useCallback(async () => {
    const [datesData, remData] = await Promise.all([
      apiFetch<ImportantDate[]>(`/api/persons/${personId}/important-dates/`),
      apiFetch<Reminder[]>(`/api/reminders/?person_id=${personId}`),
    ]);
    setDates(datesData);
    setReminders(remData);
  }, [personId]);

  const reloadAttachments = useCallback(async () => {
    const data = await apiFetch<Attachment[]>(
      `/api/attachments/?subject_type=person&subject_id=${personId}`,
    );
    setAttachments(data);
  }, [personId]);

  // Load the active tab when it has no data yet.
  useEffect(() => {
    if (status !== "ready") return;
    switch (tab) {
      case "contact":
        if (contacts === null) void reloadContacts().catch(() => undefined);
        break;
      case "interactions":
        if (interactions === null)
          void reloadInteractions().catch(() => undefined);
        break;
      case "notes":
        if (notes === null) void reloadNotes().catch(() => undefined);
        break;
      case "dates":
        if (dates === null || reminders === null)
          void reloadDates().catch(() => undefined);
        break;
      case "attachments":
        if (attachments === null)
          void reloadAttachments().catch(() => undefined);
        break;
    }
    // Note: only fires if `tab` changes or if the data is null.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tab]);

  const cadenceLabel = person ? t(cadenceStatusKey(person.cadence_status)) : "";

  const headerName = person ? displayName(person) : "";

  // -------- Render --------
  if (status === "error") {
    return (
      <div className="neo-card space-y-4 p-5">
        <p className="text-sm font-semibold">{t("person.load_error")}</p>
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

  // The detail is built only when there is a person; while loading, LoadingSwap shows the skeleton.
  const renderDetail = (person: Person) => {
  // Main current organization (the backend sorts current ones first).
  const mainOrg = (person.organizations ?? []).find((m) => m.is_current) ?? null;
  // Avoid repeating data: the membership role is omitted if it equals the person's
  // role, and the company is omitted if it equals the organization name.
  const sameText = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const orgRole = mainOrg?.role && !sameText(mainOrg.role, person.role) ? mainOrg.role : "";
  const company = sameText(person.company, mainOrg?.name) ? "" : person.company;
  const metaLine = [person.nick_name, person.role, company].filter(Boolean).join(" · ");
  const favLabel = person.favorite
    ? t("person.remove_from_favorites")
    : t("person.add_to_favorites");

  return (
    <div className="space-y-6">
      {/* ============ HEADER ============ */}
      <section className="neo-card flex flex-col gap-4 p-5 sm:flex-row">
        <Avatar name={headerName} photoId={person.profile_photo} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold">{headerName}</h1>
              {(metaLine || mainOrg) && (
                <p className="mt-1 text-sm text-fg-muted">
                  {metaLine}
                  {mainOrg && (
                    <>
                      {metaLine && " · "}
                      {orgRole && `${orgRole} · `}
                      <a
                        href={`/organizations/${mainOrg.organization_id}/`}
                        className="text-fg-muted no-underline hover:text-primary hover:underline"
                      >
                        {mainOrg.name}
                      </a>
                    </>
                  )}
                </p>
              )}
              <AiMark createdVia={person.created_via} className="mt-1" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="neo-btn neo-btn-sm neo-btn-primary"
                onClick={handleMarkContacted}
                disabled={!!busyAction}
              >
                {t("person.mark_contacted_today")}
              </button>
              <button type="button" className="neo-btn neo-btn-sm" onClick={() => setShowEdit(true)}>
                {t("common.edit")}
              </button>
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={!!busyAction}
                aria-pressed={person.favorite}
                aria-label={favLabel}
                title={favLabel}
                className="btn-icon"
              >
                <Star
                  className={person.favorite ? "size-4 fill-current text-fg" : "size-4"}
                  aria-hidden="true"
                />
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="btn-icon"
                  aria-haspopup="menu"
                  aria-expanded={showMore}
                  aria-label={t("person.more_actions")}
                  title={t("person.more_actions")}
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
                      className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-muted"
                      onClick={() => {
                        setShowMore(false);
                        void handleDownloadVcard();
                      }}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      {t("person.download_vcard")}
                    </button>
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
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CadenceBadge status={person.cadence_status} label={cadenceLabel} />
            {person.cadence_days !== null && (
              <span className="text-xs text-fg-muted tabular-nums">
                {t("person.cadence_every", { count: person.cadence_days })}
              </span>
            )}
            {person.last_contacted_at && (
              <span
                className="text-xs text-fg-muted tabular-nums"
                title={formatDate(person.last_contacted_at, lang)}
              >
                {t("person.last_contact_label", {
                  when: formatRelative(person.last_contacted_at, lang),
                })}
              </span>
            )}
            {person.tags.map((tag) => (
              <TagPill key={tag.id} name={tag.name} color={tag.color} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ TABS ============ */}
      <Tabs<TabKey>
        ariaLabel={headerName}
        idPrefix="person"
        active={tab}
        onChange={changeTab}
        tabs={TAB_KEYS.map((key) => ({ key, label: t(`person.tabs.${key}`) }))}
      />

      <section
        id={`person-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`person-tab-${tab}`}
        className="neo-card p-5"
      >
        <div key={tab} className={tabSwitched ? "fade-in" : undefined}>
          {tab === "contact" && (
            <ContactTab
              personId={person.id}
              contacts={contacts}
              person={person}
              onReload={reloadContacts}
              onPersonUpdate={(p) => setPerson(p)}
            />
          )}
          {tab === "interactions" && (
            <InteractionsTab
              personId={person.id}
              interactions={interactions}
              onReload={reloadInteractions}
            />
          )}
          {tab === "notes" && (
            <NotesTab
              personId={person.id}
              notes={notes}
              onReload={reloadNotes}
            />
          )}
          {tab === "dates" && (
            <DatesTab
              personId={person.id}
              dates={dates}
              reminders={reminders}
              onReload={reloadDates}
            />
          )}
          {tab === "attachments" && (
            <AttachmentsTab
              personId={person.id}
              attachments={attachments}
              onReload={reloadAttachments}
            />
          )}
        </div>
      </section>

      {/* ============ MODALS ============ */}
      <EditPersonModal
        open={showEdit}
        person={person}
        onClose={() => setShowEdit(false)}
        onSaved={handleSavePerson}
      />
      <ConfirmModal
        open={showDelete}
        title={t("common.delete")}
        message={t("person.delete_confirm", { name: headerName })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={busyAction === "delete"}
        onConfirm={handleDeletePerson}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
  };

  return (
    <LoadingSwap
      loading={status === "loading"}
      label={t("common.loading")}
      skeleton={<PersonDetailSkeleton />}
    >
      {person ? renderDetail(person) : null}
    </LoadingSwap>
  );
}

function parseHashTab(): TabKey {
  if (typeof window === "undefined") return "contact";
  const raw = window.location.hash.replace(/^#/, "");
  return (TAB_KEYS as string[]).includes(raw) ? (raw as TabKey) : "contact";
}

export default withLang(PersonDetailView);
