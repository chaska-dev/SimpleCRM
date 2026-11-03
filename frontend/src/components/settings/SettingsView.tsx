/**
 * SettingsView — main island of /settings.
 *
 * Renders a row of tabs (General / Defaults / Import-Export / Storage /
 * Encryption / Integrations / Account) and mounts the matching sub-component based on
 * the URL hash (`#general`, `#defaults`, …). Default = `#general`.
 *
 * The tab state lives in the hash so it is shareable / bookmark-able
 * and so Astro ClientRouter does not break internal navigation.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation, withLang } from "../../i18n";
import type { Lang, User } from "../../types";
import Tabs from "../ui/Tabs";
import GeneralTab from "./GeneralTab";
import DefaultsTab from "./DefaultsTab";
import StorageTab from "./StorageTab";
import EncryptionTab from "./EncryptionTab";
import AccountTab from "./AccountTab";
import IntegrationsTab from "./IntegrationsTab";
import ImportExportTab from "./ImportExportTab";

export type SettingsTabId =
  | "general"
  | "defaults"
  | "import"
  | "storage"
  | "encryption"
  | "integrations"
  | "account";

const TAB_IDS: readonly SettingsTabId[] = [
  "general",
  "defaults",
  "import",
  "storage",
  "encryption",
  "integrations",
  "account",
];

const DEFAULT_TAB: SettingsTabId = "general";

function isTabId(value: string): value is SettingsTabId {
  return (TAB_IDS as readonly string[]).includes(value);
}

function readTabFromHash(): SettingsTabId {
  if (typeof window === "undefined") return DEFAULT_TAB;
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  if (isTabId(raw)) return raw;
  // Deep-link `/settings/?tab=import` (e.g. the "Import" button on People).
  const fromQuery = (new URLSearchParams(window.location.search).get("tab") ?? "").toLowerCase();
  return isTabId(fromQuery) ? fromQuery : DEFAULT_TAB;
}

function writeTabToHash(tab: SettingsTabId): void {
  if (typeof window === "undefined") return;
  // replaceState avoids polluting history with every tab click.
  // We pass the full URL (pathname + search + #hash) — not just the hash —
  // because passing `"#x"` to replaceState is browser-dependent and in some
  // browsers it wipes the pathname, leaving us at `/` instead of `/settings/`.
  const next = `#${tab}`;
  if (window.location.hash !== next) {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(null, "", url);
  }
}

interface Props {
  lang: Lang;
  user: User;
}

function SettingsView({ lang, user }: Props) {
  const { t } = useTranslation();
  // Initial SSR render: falls back to the default tab (the hash is client-only).
  // As soon as it hydrates, useEffect syncs with the real hash.
  const [tab, setTab] = useState<SettingsTabId>(DEFAULT_TAB);
  // The tab content enters with .fade-in only after a manual tab change.
  const [tabSwitched, setTabSwitched] = useState(false);

  // Hydrate from the hash after mount.
  useEffect(() => {
    setTab(readTabFromHash());
    const onHashChange = () => {
      setTabSwitched(true);
      setTab(readTabFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // With 7 tabs the row scrolls horizontally (Tabs already allows it): keep the active one visible.
  useEffect(() => {
    document
      .getElementById(`settings-tab-${tab}`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);

  const selectTab = useCallback((next: SettingsTabId) => {
    writeTabToHash(next);
    setTabSwitched(true);
    setTab(next);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      <Tabs<SettingsTabId>
        ariaLabel={t("settings.title")}
        idPrefix="settings"
        active={tab}
        onChange={selectTab}
        tabs={TAB_IDS.map((id) => ({ key: id, label: t(`settings.tabs.${id}`) }))}
      />

      {/* Panel */}
      <div
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        className="neo-card p-5"
      >
        <div key={tab} className={tabSwitched ? "fade-in" : undefined}>
          {tab === "general" && <GeneralTab lang={lang} user={user} />}
          {tab === "defaults" && <DefaultsTab lang={lang} />}
          {tab === "import" && <ImportExportTab />}
          {tab === "storage" && <StorageTab />}
          {tab === "encryption" && <EncryptionTab lang={lang} />}
          {tab === "integrations" && <IntegrationsTab user={user} />}
          {tab === "account" && <AccountTab lang={lang} user={user} />}
        </div>
      </div>
    </div>
  );
}

export default withLang(SettingsView);
