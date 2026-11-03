/**
 * ConnectionCard — steps 1 and 2: server URL + token to use + "Test connection".
 *
 * The full token is requested from `/reveal/` only when the user presses Show,
 * Copy or Test; it lives in the parent component's memory (never in localStorage).
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Plug, XCircle } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { McpToken } from "../../../types";
import CopyButton from "./CopyButton";
import { isLocalUrl, testMcpConnection, type TestResult } from "./clientConfigs";

interface Props {
  url: string;
  tokens: McpToken[];
  selected: McpToken | null;
  /** Full token of the selected one if already in memory. */
  secret: string | null;
  /** There are active tokens but none can be shown again. */
  legacyOnly: boolean;
  generating: boolean;
  onSelect: (id: number) => void;
  onGenerate: () => void;
  ensureSecret: () => Promise<string | null>;
}

export default function ConnectionCard({
  url,
  tokens,
  selected,
  secret,
  legacyOnly,
  generating,
  onSelect,
  onGenerate,
  ensureSecret,
}: Props) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [busyShow, setBusyShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const selectedId = selected?.id ?? null;
  useEffect(() => {
    setShown(false);
    setResult(null);
  }, [selectedId]);

  const masked = selected ? `${selected.prefix}${"•".repeat(8)}` : "";
  const tokenText = shown && secret ? secret : masked;

  const toggleShow = async () => {
    if (shown) {
      setShown(false);
      return;
    }
    setBusyShow(true);
    const value = await ensureSecret();
    setBusyShow(false);
    if (value) setShown(true);
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    const value = await ensureSecret();
    if (!value) {
      setTesting(false);
      return;
    }
    setResult(await testMcpConnection(url, value));
    setTesting(false);
  };

  const resultMessage = result
    ? result.ok
      ? t("settings.integrations.test_ok", { name: result.name, version: result.version }).trim()
      : t(`settings.integrations.${result.key}`, result.vars)
    : "";

  return (
    <div className="mt-4 space-y-4">
      {/* URL */}
      <div>
        <label htmlFor="mcp-url" className="mb-1.5 block text-sm font-medium">
          {t("settings.integrations.url_label")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="mcp-url"
            type="text"
            readOnly
            value={url}
            className="neo-input min-w-0 flex-1 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton getText={() => url} ariaLabel={`${t("settings.integrations.copy")} ${t("settings.integrations.url_label")}`} />
        </div>
        {isLocalUrl(url) && (
          <p className="mt-2 flex items-start gap-2 text-xs text-fg-muted">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("settings.integrations.localhost_warning")}</span>
          </p>
        )}
      </div>

      {/* Token */}
      <div>
        <p className="mb-1.5 text-sm font-medium" id="mcp-token-heading">
          {t("settings.integrations.token_label")}
        </p>
        {selected ? (
          <div className="space-y-2">
            {tokens.length > 1 && (
              <div>
                <label htmlFor="mcp-token-select" className="sr-only">
                  {t("settings.integrations.token_select_label")}
                </label>
                <select
                  id="mcp-token-select"
                  className="neo-input"
                  value={selected.id}
                  onChange={(e) => onSelect(Number(e.target.value))}
                >
                  {tokens.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.name} ({tk.prefix}...)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                aria-labelledby="mcp-token-heading"
                value={tokenText}
                className="neo-input min-w-0 flex-1 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="neo-btn neo-btn-sm"
                onClick={() => void toggleShow()}
                disabled={busyShow}
                aria-pressed={shown}
              >
                {shown ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
                {busyShow
                  ? t("settings.integrations.token_loading")
                  : shown
                    ? t("settings.integrations.token_hide")
                    : t("settings.integrations.token_show")}
              </button>
              <CopyButton
                label={t("settings.integrations.token_copy")}
                getText={async () => await ensureSecret()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-fg-muted" aria-hidden="true" />
                {t("settings.integrations.token_none_title")}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {legacyOnly
                  ? t("settings.integrations.token_legacy_help")
                  : t("settings.integrations.token_none_help")}
              </p>
            </div>
            <button
              type="button"
              className="neo-btn neo-btn-sm neo-btn-primary"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? t("common.loading") : t("settings.integrations.generate_token")}
            </button>
          </div>
        )}
      </div>

      {/* Test connection */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="neo-btn neo-btn-sm"
          onClick={() => void runTest()}
          disabled={!selected || testing}
        >
          <Plug className="size-4" aria-hidden="true" />
          {testing ? t("settings.integrations.testing") : t("settings.integrations.test_connection")}
        </button>
        <p role="status" aria-live="polite" className="min-w-0 text-sm">
          {result && (
            <span
              className={`inline-flex items-start gap-1.5 ${
                result.ok ? "text-status-ok-fg" : "text-status-overdue-fg"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="break-words">{resultMessage}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
