/**
 * IntegrationsTab — connect an AI agent (MCP) in 3 steps.
 *
 * 1. "Allow AI agent access" switch → PATCH /api/auth/me/
 *    { mcp_enabled }. Notifies the shell (`crm:user-updated`) to show or hide
 *    "AI activity" in the nav. When off, the rest looks disabled.
 * 2. Connection: server URL + token (revealed on demand with
 *    GET /api/mcp/tokens/{id}/reveal/) + "Test connection".
 * 3. Configure your client: block ready for Claude Code, Claude Desktop, Cursor,
 *    VS Code or another.
 * Further down: token list (create/revoke) and, only if the backend sends it, the
 * stdio config of the same machine.
 *
 * Full tokens live only in this component's memory.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Bot, KeyRound, Plus } from "lucide-react";
import { useTranslation } from "../../i18n";
import { apiFetch } from "../../lib/api";
import { IntegrationsBodySkeleton, LoadingSwap } from "../ui";
import { toast } from "../../lib/toaster";
import { formatRelative } from "../../utils/format";
import type { McpConfig, McpScope, McpToken, McpTokenCreated, User } from "../../types";
import EmptyState from "../ui/EmptyState";
import ConfirmModal from "../ui/ConfirmModal";
import ClientConfigCard from "./integrations/ClientConfigCard";
import ConnectionCard from "./integrations/ConnectionCard";
import CopyButton from "./integrations/CopyButton";
import { TOKEN_PLACEHOLDER, buildStdioConfig } from "./integrations/clientConfigs";

interface Props {
  user: User;
}

function broadcastUser(detail: Partial<User>): void {
  window.dispatchEvent(new CustomEvent("crm:user-updated", { detail }));
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function IntegrationsTab({ user }: Props) {
  const { t, lang } = useTranslation();
  const [enabled, setEnabled] = useState(Boolean(user.mcp_enabled));
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [config, setConfig] = useState<McpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // Full tokens already obtained (creation or /reveal/). Memory only, never localStorage.
  const [secrets, setSecrets] = useState<Record<number, string>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<McpScope[]>(["read", "write"]);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<McpToken | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    let alive = true;
    Promise.all([
      apiFetch<McpToken[]>("/api/mcp/tokens/"),
      apiFetch<McpConfig>("/api/mcp/config/"),
    ])
      .then(([tk, cfg]) => {
        if (!alive) return;
        setTokens(tk);
        setConfig(cfg);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(errMessage(err, t("settings.integrations.load_error")));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = config ? (config.public_url ?? `${origin}/mcp/`) : "";

  // Tokens that can be used in "Connection": active and with an available value.
  const usable = useMemo(
    () => tokens.filter((tk) => tk.is_active && (tk.can_reveal || secrets[tk.id])),
    [tokens, secrets],
  );
  const selected = usable.find((tk) => tk.id === selectedId) ?? usable[0] ?? null;
  const secret = selected ? (secrets[selected.id] ?? null) : null;
  const legacyOnly = usable.length === 0 && tokens.some((tk) => tk.is_active);

  const toggleEnabled = useCallback(async () => {
    const next = !enabled;
    setSavingEnabled(true);
    setEnabled(next);
    try {
      await apiFetch<User>("/api/auth/me/", { method: "PATCH", body: { mcp_enabled: next } });
      broadcastUser({ mcp_enabled: next });
      toast.success(
        next ? t("settings.integrations.access_enabled") : t("settings.integrations.access_disabled"),
      );
    } catch (err) {
      setEnabled(!next);
      toast.error(errMessage(err, t("messages.error_generic")));
    } finally {
      setSavingEnabled(false);
    }
  }, [enabled, t]);

  const ensureSecret = useCallback(async (): Promise<string | null> => {
    if (!selected) return null;
    const cached = secrets[selected.id];
    if (cached) return cached;
    try {
      const res = await apiFetch<{ token: string }>(`/api/mcp/tokens/${selected.id}/reveal/`);
      setSecrets((prev) => ({ ...prev, [selected.id]: res.token }));
      return res.token;
    } catch (err) {
      toast.error(errMessage(err, t("settings.integrations.reveal_failed")));
      return null;
    }
  }, [selected, secrets, t]);

  /** Creates a token, keeps it in memory and leaves it selected in "Connection". */
  const createAndSelect = useCallback(
    async (tokenName: string, tokenScopes: McpScope[]): Promise<boolean> => {
      try {
        const res = await apiFetch<McpTokenCreated>("/api/mcp/tokens/", {
          method: "POST",
          body: { name: tokenName, scopes: tokenScopes },
        });
        const { token, ...row } = res;
        setTokens((prev) => [row, ...prev]);
        setSecrets((prev) => ({ ...prev, [row.id]: token }));
        setSelectedId(row.id);
        toast.success(t("settings.integrations.generated_toast"));
        return true;
      } catch (err) {
        toast.error(errMessage(err, t("messages.error_generic")));
        return false;
      }
    },
    [t],
  );

  const generateToken = useCallback(async () => {
    setGenerating(true);
    await createAndSelect(t("settings.integrations.default_token_name"), ["read", "write"]);
    setGenerating(false);
  }, [createAndSelect, t]);

  const openCreate = useCallback(() => {
    setName("");
    setScopes(["read", "write"]);
    setCreateOpen(true);
  }, []);

  const toggleScope = useCallback((scope: McpScope) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }, []);

  const submitCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || scopes.length === 0) return;
    setCreating(true);
    const ok = await createAndSelect(trimmed, scopes);
    setCreating(false);
    if (ok) setCreateOpen(false);
  }, [name, scopes, createAndSelect]);

  const revokeToken = useCallback(async () => {
    if (!revoking) return;
    const target = revoking;
    setRevoking(null);
    try {
      const updated = await apiFetch<McpToken>(`/api/mcp/tokens/${target.id}/revoke/`, {
        method: "POST",
      });
      setTokens((prev) => prev.map((tk) => (tk.id === updated.id ? updated : tk)));
      setSecrets((prev) => {
        const { [updated.id]: _gone, ...rest } = prev;
        return rest;
      });
      toast.success(t("settings.integrations.revoked_toast"));
    } catch (err) {
      toast.error(errMessage(err, t("messages.error_generic")));
    }
  }, [revoking, t]);

  const scopeLabel = (s: McpScope) => t(`settings.integrations.scope_${s}`);
  const stdio = config?.stdio;
  const stdioText = stdio ? buildStdioConfig(stdio, secret ?? TOKEN_PLACEHOLDER) : "";

  return (
    <div className="divide-y divide-border">
      {/* 1. Access */}
      <section className="py-5 first:pt-0">
        <h2 className="text-sm font-semibold">{t("settings.integrations.section_access")}</h2>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium" id="mcp-enabled-label">
              {t("settings.integrations.access_label")}
            </p>
            <p className="mt-1 text-xs text-fg-muted">{t("settings.integrations.access_help")}</p>
            {enabled && (
              <a
                href="/activity/"
                className="mt-2 inline-flex items-center gap-1.5 text-sm no-underline hover:underline"
              >
                <Bot className="size-4" aria-hidden="true" />
                {t("settings.integrations.activity_link")}
              </a>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="mcp-enabled-label"
            onClick={toggleEnabled}
            disabled={savingEnabled}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-surface shadow-sm transition-transform duration-fast ease-standard ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {!enabled && (
          <p className="mt-3 text-xs text-fg-muted" role="note">
            {t("settings.integrations.disabled_notice")}
          </p>
        )}
      </section>

      <LoadingSwap
        loading={loading}
        label={t("common.loading")}
        skeleton={<IntegrationsBodySkeleton />}
      >
      {loadError ? (
        <p role="alert" className="py-5 text-sm text-status-overdue-fg">
          {loadError}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {/* 2. Connection */}
          <fieldset
            disabled={!enabled}
            className={`m-0 min-w-0 border-0 p-0 ${enabled ? "" : "opacity-60"}`}
          >
            <section className="py-5">
              <h2 className="text-sm font-semibold">{t("settings.integrations.section_connection")}</h2>
              <p className="mt-1 text-xs text-fg-muted">{t("settings.integrations.connection_help")}</p>
              <ConnectionCard
                url={url}
                tokens={usable}
                selected={selected}
                secret={secret}
                legacyOnly={legacyOnly}
                generating={generating}
                onSelect={setSelectedId}
                onGenerate={() => void generateToken()}
                ensureSecret={ensureSecret}
              />
            </section>

            {/* 3. Configure your client */}
            <section className="border-t border-border py-5">
              <h2 className="text-sm font-semibold">{t("settings.integrations.section_clients")}</h2>
              <p className="mt-1 text-xs text-fg-muted">{t("settings.integrations.clients_help")}</p>
              <ClientConfigCard
                url={url}
                hasToken={selected !== null}
                secret={secret}
                ensureSecret={ensureSecret}
              />
            </section>
          </fieldset>

          {/* 4. Tokens */}
          <section className="py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t("settings.integrations.section_tokens")}</h2>
                <p className="mt-1 text-xs text-fg-muted">{t("settings.integrations.tokens_help")}</p>
              </div>
              <button
                type="button"
                className="neo-btn neo-btn-sm neo-btn-primary"
                onClick={openCreate}
                disabled={!enabled}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("settings.integrations.create_token")}
              </button>
            </div>

            <div className="mt-4">
              {tokens.length === 0 ? (
                <EmptyState
                  icon={KeyRound}
                  title={t("settings.integrations.tokens_empty_title")}
                  description={t("settings.integrations.tokens_empty_description")}
                />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {tokens.map((tk) => {
                    const expired =
                      !tk.revoked_at &&
                      tk.expires_at !== null &&
                      new Date(tk.expires_at) <= new Date();
                    const inactive = Boolean(tk.revoked_at) || expired;
                    return (
                      <li key={tk.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${inactive ? "text-fg-muted line-through" : ""}`}
                          >
                            {tk.name}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                            <span className="tabular-nums">{tk.prefix}...</span>
                            <span>{tk.scopes.map(scopeLabel).join(", ")}</span>
                            <span className="tabular-nums" title={tk.last_used_at ?? undefined}>
                              {tk.last_used_at
                                ? t("settings.integrations.last_used", {
                                    when: formatRelative(tk.last_used_at, lang),
                                  })
                                : t("settings.integrations.never_used")}
                            </span>
                            {tk.revoked_at && <span>{t("settings.integrations.status_revoked")}</span>}
                            {expired && <span>{t("settings.integrations.status_expired")}</span>}
                          </p>
                        </div>
                        {!inactive && (
                          <button
                            type="button"
                            className="btn-icon hover:text-accent hover:bg-status-overdue"
                            aria-label={t("settings.integrations.revoke")}
                            title={t("settings.integrations.revoke")}
                            onClick={() => setRevoking(tk)}
                          >
                            <Ban className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* 5. Advanced: stdio (only if the backend sends the routes) */}
          {stdio && (
            <section className="py-5 last:pb-0">
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("settings.integrations.section_advanced")}
                </summary>
                <p className="mt-3 text-xs text-fg-muted">{t("settings.integrations.stdio_help")}</p>
                <div className="mt-2 flex items-start gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs text-fg">
                    {stdioText}
                  </pre>
                  <CopyButton
                    label={t("settings.integrations.copy_config")}
                    getText={async () =>
                      buildStdioConfig(stdio, secret ?? (await ensureSecret()) ?? TOKEN_PLACEHOLDER)
                    }
                  />
                </div>
              </details>
            </section>
          )}
        </div>
      )}
      </LoadingSwap>

      {/* New token */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-create-title"
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={t("common.cancel")}
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 cursor-default border-0 bg-black/40"
          />
          <form
            className="neo-card relative z-50 w-full max-w-md p-6 shadow-lg"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCreate();
            }}
          >
            <h2 id="mcp-create-title" className="mb-4 text-sm font-semibold">
              {t("settings.integrations.create_title")}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="mcp-token-name" className="mb-1.5 block text-sm font-medium">
                  {t("settings.integrations.name_label")}
                </label>
                <input
                  id="mcp-token-name"
                  type="text"
                  className="neo-input"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("settings.integrations.name_placeholder")}
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium">
                  {t("settings.integrations.scopes_label")}
                </legend>
                <div className="space-y-2">
                  {(["read", "write"] as McpScope[]).map((s) => (
                    <label key={s} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4"
                        checked={scopes.includes(s)}
                        onChange={() => toggleScope(s)}
                      />
                      <span>
                        <span className="font-medium">{scopeLabel(s)}</span>
                        <span className="block text-xs text-fg-muted">
                          {t(`settings.integrations.scope_${s}_help`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" className="neo-btn" onClick={() => setCreateOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="neo-btn neo-btn-primary"
                disabled={creating || !name.trim() || scopes.length === 0}
              >
                {creating ? t("common.loading") : t("settings.integrations.create_cta")}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={revoking !== null}
        title={t("settings.integrations.revoke_title")}
        message={t("settings.integrations.revoke_body", { name: revoking?.name ?? "" })}
        confirmLabel={t("settings.integrations.revoke")}
        destructive
        onConfirm={revokeToken}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
