/**
 * ActivityView — React island for /activity/.
 *
 * History of AI agent (MCP) actions in a card with divided rows: tool,
 * object (link), status, relative date and, for creations, an Undo button
 * (with confirmation). Only useful with `mcp_enabled`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Undo2 } from "lucide-react";
import { useTranslation, withLang } from "../../i18n";
import { apiFetch } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { formatDateTime, formatRelative } from "../../utils/format";
import type { AgentAction, Lang, User } from "../../types";
import { ActivityRowSkeleton, LoadingSwap } from "../ui";
import EmptyState from "../ui/EmptyState";
import ConfirmModal from "../ui/ConfirmModal";

interface Props {
  lang: Lang;
  user: User;
}

const LIMIT = 100;

const TOOL_NAMES = [
  "create_person",
  "update_person",
  "add_contact_info",
  "add_birthday",
  "add_important_date",
  "create_reminder",
  "complete_reminder",
  "move_reminder",
  "schedule_meeting",
  "log_interaction",
  "add_note",
  "tag_person",
  "create_organization",
  "add_person_to_organization",
] as const;

/** Short summary of the object from the arguments (sensitive text is not stored). */
function summaryOf(a: AgentAction): string {
  const args = a.arguments ?? {};
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const person = [str("first_name"), str("last_name")].filter(Boolean).join(" ");
  return person || str("name") || str("title") || str("value") || "";
}

/** Link target based on the type of the created/touched object. */
function hrefOf(a: AgentAction): string | null {
  if (a.target_id === null || a.undone_at) return null;
  switch (a.target_type) {
    case "person":
      return `/persons/${a.target_id}/`;
    case "organization":
      return `/organizations/${a.target_id}/`;
    case "reminder":
      return "/reminders/";
    default:
      return a.link_person_id ? `/persons/${a.link_person_id}/` : null;
  }
}

function ActivityView({ user }: Props) {
  const { t, lang } = useTranslation();
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState("");
  const [undoing, setUndoing] = useState<AgentAction | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const enabled = Boolean(user.mcp_enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(LIMIT) });
    if (tool) params.set("tool", tool);
    apiFetch<AgentAction[]>(`/api/mcp/actions/?${params.toString()}`, { signal: controller.signal })
      .then((data) => {
        setActions(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("activity.load_error"));
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, enabled]);

  const undo = useCallback(async () => {
    if (!undoing) return;
    const target = undoing;
    setUndoing(null);
    setBusyId(target.id);
    try {
      const updated = await apiFetch<AgentAction>(`/api/mcp/actions/${target.id}/undo/`, {
        method: "POST",
      });
      setActions((prev) => prev.map((a) => (a.id === target.id ? { ...a, ...updated } : a)));
      toast.success(t("activity.undo_done"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    } finally {
      setBusyId(null);
    }
  }, [undoing, t]);

  const targetLabel = useCallback(
    (type: string) => (type ? t(`activity.targets.${type}`) : ""),
    [t],
  );

  const body = useMemo(() => {
    if (!enabled) {
      return (
        <div className="neo-card">
          <EmptyState
            icon={Bot}
            title={t("activity.disabled_title")}
            description={t("activity.disabled_description")}
            action={
              <a href="/settings/#integrations" className="neo-btn neo-btn-sm no-underline">
                {t("activity.go_settings")}
              </a>
            }
          />
        </div>
      );
    }
    if (error) {
      return (
        <div role="alert" className="rounded-lg bg-status-overdue px-4 py-3 text-status-overdue-fg">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        </div>
      );
    }
    if (actions.length === 0) {
      return (
        <div className="neo-card">
          <EmptyState
            icon={Bot}
            title={t("activity.empty_title")}
            description={t("activity.empty_description")}
          />
        </div>
      );
    }
    return (
      <ul className="neo-card divide-y divide-border">
        {actions.map((a) => {
          const href = hrefOf(a);
          const summary = summaryOf(a);
          const objectText = a.target_id
            ? t("activity.object_link", { target: targetLabel(a.target_type), id: `#${a.target_id}` })
            : "";
          const toolLabel = (TOOL_NAMES as readonly string[]).includes(a.tool_name)
            ? t(`activity.tools.${a.tool_name}`)
            : a.tool_name;
          return (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{toolLabel}</span>
                  {summary && <span className="truncate text-fg-muted">{summary}</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                  {objectText &&
                    (href ? (
                      <a href={href} className="text-primary no-underline hover:underline">
                        {objectText}
                      </a>
                    ) : (
                      <span>{objectText}</span>
                    ))}
                  <span
                    className={a.status === "error" ? "text-status-overdue-fg" : ""}
                    title={a.status === "error" ? a.error_message : undefined}
                  >
                    {a.undone_at
                      ? t("activity.undone")
                      : a.status === "ok"
                        ? t("activity.status_ok")
                        : t("activity.status_error")}
                  </span>
                  <span className="tabular-nums" title={formatDateTime(a.created_at, lang)}>
                    {formatRelative(a.created_at, lang)}
                  </span>
                  {a.token_name && (
                    <span className="truncate">{t("activity.via_token", { name: a.token_name })}</span>
                  )}
                </p>
              </div>
              {a.can_undo && (
                <button
                  type="button"
                  className="neo-btn neo-btn-sm"
                  disabled={busyId === a.id}
                  onClick={() => setUndoing(a)}
                >
                  <Undo2 className="size-4" aria-hidden="true" />
                  {t("activity.undo")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }, [enabled, error, actions, busyId, lang, t, targetLabel]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{t("activity.title")}</h1>
          {enabled && !loading && !error && (
            <span className="text-sm text-fg-muted tabular-nums">{actions.length}</span>
          )}
        </div>
      </div>

      {enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            aria-label={t("activity.filter_tool")}
            className="neo-input w-auto"
          >
            <option value="">{t("activity.all_tools")}</option>
            {TOOL_NAMES.map((name) => (
              <option key={name} value={name}>
                {t(`activity.tools.${name}`)}
              </option>
            ))}
          </select>
        </div>
      )}

      {enabled ? (
        <LoadingSwap
          loading={loading}
          label={t("common.loading")}
          skeleton={
            <ul className="neo-card divide-y divide-border">
              {Array.from({ length: 5 }, (_, i) => (
                <ActivityRowSkeleton key={i} />
              ))}
            </ul>
          }
        >
          {body}
        </LoadingSwap>
      ) : (
        body
      )}

      <ConfirmModal
        open={undoing !== null}
        title={t("activity.undo_title")}
        message={t("activity.undo_body", {
          target: undoing
            ? `${targetLabel(undoing.target_type)} #${undoing.target_id ?? ""}`
            : "",
        })}
        confirmLabel={t("activity.undo_cta")}
        destructive
        onConfirm={undo}
        onCancel={() => setUndoing(null)}
      />
    </div>
  );
}

export default withLang(ActivityView);
