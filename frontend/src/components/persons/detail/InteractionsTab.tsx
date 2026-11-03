import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Phone,
  MessageSquare,
  Mail,
  Handshake,
  Video,
  Gift,
  FileText,
  CircleDot,
  Plus,
  Trash2,
  Check,
  MessagesSquare,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import type { Interaction, InteractionKind, InteractionCreate } from "../../../types";
import Modal from "./Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import { formatDateTime, formatRelative } from "./helpers";
import EmptyState from "../../ui/EmptyState";
import { LoadingSwap, BorderedListSkeleton } from "../../ui";

interface Props {
  personId: number;
  interactions: Interaction[] | null;
  onReload: () => Promise<void>;
}

const KIND_ICONS: Record<InteractionKind, typeof Phone> = {
  call: Phone,
  message: MessageSquare,
  email: Mail,
  meeting_in_person: Handshake,
  video_call: Video,
  gift: Gift,
  note_shared: FileText,
  other: CircleDot,
};

const KIND_KEYS: InteractionKind[] = [
  "call",
  "message",
  "email",
  "meeting_in_person",
  "video_call",
  "gift",
  "note_shared",
  "other",
];

/**
 * InteractionsTab — descending timeline.
 *
 * - Filter by kind (all or one).
 * - "+ See more" if there are more than 20.
 * - "Log interaction" opens a modal with kind + datetime + channel + body +
 *   counts_as_contact.
 */
export default function InteractionsTab({
  personId,
  interactions,
  onReload,
}: Props) {
  const { t, lang } = useTranslation();
  const [kindFilter, setKindFilter] = useState<"all" | InteractionKind>("all");
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Interaction | null>(null);

  const toggleExpanded = (id: number) => {
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!interactions) return [];
    if (kindFilter === "all") return interactions;
    return interactions.filter((i) => i.kind === kindFilter);
  }, [interactions, kindFilter]);

  const visible = showAll ? filtered : filtered.slice(0, 20);

  const onAdd = useCallback(
    async (payload: InteractionCreate) => {
      try {
        await apiFetch<Interaction>(`/api/persons/${personId}/interactions/`, {
          method: "POST",
          body: payload,
        });
        toast.success(t("interaction.saved"));
        setShowAdd(false);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [personId, onReload, t],
  );

  const onDelete = useCallback(
    async (i: Interaction) => {
      try {
        await apiFetch<void>(`/api/persons/${personId}/interactions/${i.id}/`, {
          method: "DELETE",
        });
        toast.success(t("interaction.deleted"));
        setPendingDelete(null);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
        setPendingDelete(null);
      }
    },
    [personId, onReload, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          className="neo-input w-auto"
          aria-label={t("interaction.filter_kind")}
          value={kindFilter}
          onChange={(e) => {
            setKindFilter(e.target.value as "all" | InteractionKind);
            setShowAll(false);
          }}
        >
          <option value="all">{t("interaction.filter_all")}</option>
          {KIND_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`enums.interaction.kinds.${k}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="neo-btn neo-btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="size-4" aria-hidden="true" /> {t("interaction.add")}
        </button>
      </div>

      <LoadingSwap
        loading={interactions === null}
        label={t("common.loading")}
        skeleton={<BorderedListSkeleton rows={3} />}
      >
        {interactions === null ? null : filtered.length === 0 ? (
          <EmptyState icon={MessagesSquare} title={t("interaction.empty")} />
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {visible.map((i) => {
              const expanded = expandedIds.has(i.id);
              const hasBody = !!i.body && i.body.trim().length > 0;
              const Icon = KIND_ICONS[i.kind] ?? CircleDot;
              return (
                <li key={i.id} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">
                        {t(`enums.interaction.kinds.${i.kind}`)}
                        {i.channel && <span className="font-normal text-fg-muted"> · {i.channel}</span>}
                      </p>
                      <time
                        className="text-xs text-fg-muted tabular-nums"
                        dateTime={i.occurred_at}
                        title={formatDateTime(i.occurred_at, lang)}
                      >
                        {formatRelative(i.occurred_at, lang)}
                      </time>
                    </div>
                    {hasBody && (
                      <button
                        type="button"
                        className="mt-1 w-full text-left text-sm leading-snug"
                        onClick={() => toggleExpanded(i.id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? i.body : truncate(i.body ?? "", 140)}
                      </button>
                    )}
                    {i.counts_as_contact && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-status-ok-fg">
                        <Check className="size-3.5" aria-hidden="true" />
                        {t("interaction.counts_as_contact")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    onClick={() => setPendingDelete(i)}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </LoadingSwap>

      {filtered.length > 20 && (
        <div className="flex justify-center">
          <button
            type="button"
            className="neo-btn neo-btn-sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? (
              <>
                <ChevronUp className="size-4" aria-hidden="true" />
                {t("common.cancel")}
              </>
            ) : (
              <>
                <ChevronDown className="size-4" aria-hidden="true" />
                {t("interaction.see_more")}
              </>
            )}
          </button>
        </div>
      )}

      <AddInteractionModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={onAdd}
      />
      <ConfirmModal
        open={pendingDelete !== null}
        title={t("common.delete")}
        message={t("common.confirm_delete")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (pendingDelete) return onDelete(pendingDelete);
          return Promise.resolve();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: InteractionCreate) => Promise<void>;
}

function AddInteractionModal({ open, onClose, onAdd }: AddModalProps) {
  const { t } = useTranslation();
  const now = useNowLocal();
  const [kind, setKind] = useState<InteractionKind>("call");
  const [occurredAt, setOccurredAt] = useState<string>(now);
  const [channel, setChannel] = useState("");
  const [body, setBody] = useState("");
  const [countsAsContact, setCountsAsContact] = useState(true);
  const [busy, setBusy] = useState(false);

  // Re-sync occurredAt when the modal is reopened.
  useEffect(() => {
    if (open) setOccurredAt(now);
  }, [open, now]);

  const submit = async () => {
    setBusy(true);
    try {
      // datetime-local has no timezone — we assume local → toISOString.
      const iso = new Date(occurredAt).toISOString();
      await onAdd({
        kind,
        occurred_at: iso,
        channel: channel.trim(),
        body: body.trim(),
        counts_as_contact: countsAsContact,
      });
      // reset
      setKind("call");
      setChannel("");
      setBody("");
      setCountsAsContact(true);
    } catch {
      // toast in parent.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("interaction.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("interaction.kind")}
          </span>
          <select
            className="neo-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as InteractionKind)}
          >
            {KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`enums.interaction.kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("interaction.occurred_at")}
          </span>
          <input
            type="datetime-local"
            className="neo-input"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("interaction.channel")}{" "}
            <span className="font-normal text-fg-muted">({t("common.optional")})</span>
          </span>
          <input
            className="neo-input"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("interaction.body")}
          </span>
          <textarea
            className="neo-input min-h-20"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={countsAsContact}
            onChange={(e) => setCountsAsContact(e.target.checked)}
          />
          {t("interaction.counts_as_contact")}
        </label>
      </div>
    </Modal>
  );
}

/** useNowLocal — returns the current datetime-local, mounted on the client. */
function useNowLocal(): string {
  const [now] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  return now;
}