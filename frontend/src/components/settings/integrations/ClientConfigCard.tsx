/**
 * ClientConfigCard — step 3: tabs per client with the block already filled in.
 *
 * Shows the real token only if it is already in memory (it was revealed); otherwise `TOKEN`.
 * On copy the real token is always requested, so what is pasted works the first time.
 */

import { useState } from "react";
import { useTranslation } from "../../../i18n";
import Tabs from "../../ui/Tabs";
import CopyButton from "./CopyButton";
import {
  CLIENT_IDS,
  TOKEN_PLACEHOLDER,
  buildClientConfig,
  needsAllowHttp,
  type ClientId,
} from "./clientConfigs";

interface Props {
  url: string;
  /** A token is selected (even if not revealed). */
  hasToken: boolean;
  secret: string | null;
  ensureSecret: () => Promise<string | null>;
}

export default function ClientConfigCard({ url, hasToken, secret, ensureSecret }: Props) {
  const { t } = useTranslation();
  const [client, setClient] = useState<ClientId>("claude_code");

  const display = buildClientConfig(client, url, secret ?? TOKEN_PLACEHOLDER);
  const getCopyText = async (): Promise<string | null> => {
    const real = secret ?? (hasToken ? await ensureSecret() : null);
    return buildClientConfig(client, url, real ?? TOKEN_PLACEHOLDER);
  };

  return (
    <div className="mt-4">
      <Tabs<ClientId>
        ariaLabel={t("settings.integrations.clients_label")}
        idPrefix="mcp-client"
        active={client}
        onChange={setClient}
        tabs={CLIENT_IDS.map((id) => ({ key: id, label: t(`settings.integrations.client_${id}`) }))}
      />
      <div
        role="tabpanel"
        id={`mcp-client-panel-${client}`}
        aria-labelledby={`mcp-client-tab-${client}`}
        className="mt-4"
      >
        <p className="text-xs text-fg-muted">{t(`settings.integrations.help_${client}`)}</p>
        {client === "claude_desktop" && needsAllowHttp(url) && (
          <p className="mt-1 text-xs text-fg-muted">
            {t("settings.integrations.help_claude_desktop_http")}
          </p>
        )}
        <div className="mt-2 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-fg">
            {display}
          </pre>
          <CopyButton
            getText={getCopyText}
            label={t("settings.integrations.copy_config")}
            disabled={!hasToken}
          />
        </div>
        {hasToken && !secret && (
          <p className="mt-2 text-xs text-fg-muted">
            {t("settings.integrations.token_placeholder_note")}
          </p>
        )}
      </div>
    </div>
  );
}
