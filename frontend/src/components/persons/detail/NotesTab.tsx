import { useState, useMemo, useCallback } from "react";
import { Lock, Plus, StickyNote, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import type { Note, NoteCategory, NoteCreate } from "../../../types";
import Modal from "./Modal";
import { IconByKey } from "../../ui/icons";
import ConfirmModal from "../../ui/ConfirmModal";
import { formatDate, formatRelative } from "./helpers";
import EmptyState from "../../ui/EmptyState";
import { LoadingSwap, BorderedListSkeleton } from "../../ui";

interface Props {
  personId: number;
  notes: Note[] | null;
  onReload: () => Promise<void>;
}

const CATEGORY_KEYS: NoteCategory[] = [
  "general",
  "followup",
  "gift_idea",
  "important",
];

const CATEGORY_ICONS: Record<NoteCategory, string> = {
  general: "note-general",
  followup: "note-followup",
  gift_idea: "note-gift",
  important: "note-important",
};

/**
 * NotesTab — list of notes (divided rows) with category.
 *
 * - Filter by category.
 * - Click on card → expand (shows body). The body is "encrypted at rest"
 *   per the design system; we show the hint until expanded.
 */
export default function NotesTab({ personId, notes, onReload }: Props) {
  const { t, lang } = useTranslation();
  const [filter, setFilter] = useState<"all" | NoteCategory>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  const toggle = (id: number) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!notes) return [];
    if (filter === "all") return notes;
    return notes.filter((n) => n.category === filter);
  }, [notes, filter]);

  const onAdd = useCallback(
    async (payload: NoteCreate) => {
      try {
        await apiFetch<Note>(`/api/persons/${personId}/notes/`, {
          method: "POST",
          body: payload,
        });
        toast.success(t("note.saved"));
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
    async (n: Note) => {
      try {
        await apiFetch<void>(`/api/persons/${personId}/notes/${n.id}/`, {
          method: "DELETE",
        });
        toast.success(t("note.deleted"));
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
          aria-label={t("note.category_filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | NoteCategory)}
        >
          <option value="all">{t("note.filter_all")}</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c} value={c}>
              {t(`enums.note.categories.${c}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="neo-btn neo-btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("note.add")}
        </button>
      </div>

      <LoadingSwap
        loading={notes === null}
        label={t("common.loading")}
        skeleton={<BorderedListSkeleton rows={3} />}
      >
        {notes === null ? null : filtered.length === 0 ? (
          <EmptyState icon={StickyNote} title={t("note.empty")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {filtered.map((n) => {
              const isOpen = expanded.has(n.id);
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                        <IconByKey name={CATEGORY_ICONS[n.category]} className="size-3.5" />
                        {t(`enums.note.categories.${n.category}`)}
                      </span>
                      <time
                        className="text-xs text-fg-muted tabular-nums"
                        dateTime={n.created_at}
                        title={formatDate(n.created_at, lang)}
                      >
                        {formatRelative(n.created_at, lang)}
                      </time>
                    </div>
                    <button
                      type="button"
                      className="mt-1 block w-full text-left"
                      onClick={() => toggle(n.id)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <p className="whitespace-pre-wrap break-words text-sm leading-snug">{n.body}</p>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                          <Lock className="size-3.5" aria-hidden="true" />
                          {t("note.lock_hint")}
                        </p>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    onClick={() => setPendingDelete(n)}
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </LoadingSwap>

      <AddNoteModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={onAdd} />
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

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: NoteCreate) => Promise<void>;
}

function AddNoteModal({ open, onClose, onAdd }: AddModalProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<NoteCategory>("general");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onAdd({ category, body: body.trim() });
      setBody("");
      setCategory("general");
    } catch {
      // parent toasted
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("note.add")}
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
            disabled={busy || !body.trim()}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("note.category")}
          </span>
          <select
            className="neo-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as NoteCategory)}
          >
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>
                {t(`enums.note.categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("note.body")}
            <span className="text-accent ml-1">*</span>
          </span>
          <textarea
            className="neo-input min-h-32"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
          />
        </label>
      </div>
    </Modal>
  );
}