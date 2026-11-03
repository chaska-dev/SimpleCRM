/**
 * /tags — TagsView (React island, client:load).
 *
 * Lists the user's tags in a card with divided rows. CRUD:
 *  - Click on a row (or the pencil) → opens the editor (name + color + save/delete).
 *  - "New tag" (header) → creation modal.
 *  - Empty state with CTA.
 *
 * i18n: `lang` comes from the server (cookie/user) and `withLang` provides it to
 * `useTranslation()`, so SSR and hydration match.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, Tag as TagIcon } from "lucide-react";
import type { Lang, Tag } from "../../types";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { useTranslation, withLang } from "../../i18n";
import { LoadingSwap, TagRowSkeleton } from "../ui";
import EmptyState from "../ui/EmptyState";
import ConfirmModal from "../ui/ConfirmModal";

const SKELETON_COUNT = 6;

/* Predefined swatch palette for a tag's color (data, not theme). */
const SWATCHES: ReadonlyArray<string> = [
  "#eab308", // amber
  "#ef4444", // red
  "#10b981", // emerald
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#f97316", // orange
  "#14b8a6", // teal
  "#84cc16", // lime
  "#18181b", // ink
];

interface Props {
  lang: Lang;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface TagRowProps {
  tag: Tag;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  deleting: boolean;
  personLabel: (count: number) => string;
  editLabel: string;
  deleteLabel: string;
}

function TagRow({ tag, onEdit, onDelete, deleting, personLabel, editLabel, deleteLabel }: TagRowProps) {
  const count = tag.person_count ?? 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-muted">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <button
        type="button"
        onClick={() => onEdit(tag)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm font-medium">{tag.name}</span>
        <span className="block text-xs text-fg-muted tabular-nums">{personLabel(count)}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-icon"
          onClick={() => onEdit(tag)}
          aria-label={`${editLabel} ${tag.name}`}
          title={editLabel}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={() => onDelete(tag)}
          disabled={deleting}
          aria-label={`${deleteLabel} ${tag.name}`}
          title={deleteLabel}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

interface TagFormModalProps {
  /** Tag to edit; null = create. */
  initial: Tag | null;
  onSave: (name: string, color: string) => Promise<void>;
  onCancel: () => void;
  /** Edit only. */
  onDelete?: () => void;
  saving: boolean;
  deleting?: boolean;
  title: string;
  nameLabel: string;
  colorLabel: string;
  saveLabel: string;
  cancelLabel: string;
  deleteLabel?: string;
}

/** Single modal to create and edit a tag. */
function TagFormModal({
  initial,
  onSave,
  onCancel,
  onDelete,
  saving,
  deleting = false,
  title,
  nameLabel,
  colorLabel,
  saveLabel,
  cancelLabel,
  deleteLabel,
}: TagFormModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(initial?.color ?? SWATCHES[0]!);
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && HEX_RE.test(color);
  const busy = saving || deleting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-form-title"
    >
      <div className="neo-card w-full max-w-md p-6 shadow-lg">
        <h2 id="tag-form-title" className="mb-4 text-sm font-semibold">
          {title}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="tag-name">
              {nameLabel}
            </label>
            <input
              id="tag-name"
              type="text"
              className="neo-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              disabled={busy}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="tag-color">
              {colorLabel}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="tag-color"
                type="color"
                className="h-9 w-16 cursor-pointer rounded-md border border-border bg-surface p-0.5"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={busy}
              />
              <span className="text-xs text-fg-muted tabular-nums">{color}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-8 cursor-pointer rounded-full border transition-transform duration-fast hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    c.toLowerCase() === color.toLowerCase() ? "border-fg" : "border-border"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={t("tag.color_option", { color: c })}
                  aria-pressed={c.toLowerCase() === color.toLowerCase()}
                  disabled={busy}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              type="button"
              className="neo-btn neo-btn-ghost text-accent hover:bg-status-overdue"
              onClick={onDelete}
              disabled={busy}
              title={`${deleteLabel} ${initial?.name ?? ""}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span>{deleteLabel}</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="neo-btn" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className="neo-btn neo-btn-primary"
              onClick={() => onSave(trimmed, color)}
              disabled={!valid || busy}
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagsView(_props: Props) {
  void _props;
  const { t } = useTranslation();

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<Tag[]>("/api/tags/");
      setTags(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (id: number, name: string, color: string): Promise<void> => {
    setSavingId(id);
    try {
      const updated = await apiFetch<Tag>(`/api/tags/${id}/`, {
        method: "PATCH",
        body: { name, color },
      });
      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
      toast.success(t("messages.saved"));
      setEditing(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (tag: Tag): Promise<void> => {
    setDeletingId(tag.id);
    try {
      await apiFetch<void>(`/api/tags/${tag.id}/`, { method: "DELETE" });
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
      toast.success(t("messages.deleted"));
      if (editing?.id === tag.id) setEditing(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      toast.error(msg);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleCreate = async (name: string, color: string): Promise<void> => {
    setSavingId(-1);
    try {
      const created = await apiFetch<Tag>("/api/tags/", {
        method: "POST",
        body: { name, color },
      });
      setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(t("messages.saved"));
      setCreating(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : String(err);
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  const personLabel = (count: number): string => t("tag.person_count", { count });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-baseline gap-2">
        <h1 className="text-xl font-semibold">{t("tag.title")}</h1>
        {!loading && !loadError && (
          <span className="text-sm text-fg-muted tabular-nums">{tags.length}</span>
        )}
      </div>
      <button type="button" className="neo-btn neo-btn-primary" onClick={() => setCreating(true)}>
        <Plus className="size-4" aria-hidden="true" />
        <span>{t("tag.add")}</span>
      </button>
    </div>
  );

  let body;
  if (loadError) {
    body = (
      <div className="neo-card space-y-4 p-5 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {loadError}
        </p>
        <button type="button" className="neo-btn neo-btn-primary" onClick={() => void load()}>
          {t("common.back")}
        </button>
      </div>
    );
  } else if (tags.length === 0) {
    body = (
      <div className="neo-card">
        <EmptyState
          icon={TagIcon}
          title={t("tag.empty")}
          action={
            <button type="button" className="neo-btn neo-btn-sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              <span>{t("tag.add")}</span>
            </button>
          }
        />
      </div>
    );
  } else {
    body = (
      <ul className="neo-card divide-y divide-border overflow-hidden">
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            onEdit={setEditing}
            onDelete={(tg) => setConfirmDelete(tg)}
            deleting={deletingId === tag.id}
            personLabel={personLabel}
            editLabel={t("common.edit")}
            deleteLabel={t("common.delete")}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <LoadingSwap
        loading={loading}
        label={t("common.loading")}
        skeleton={
          <ul className="neo-card divide-y divide-border overflow-hidden">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <TagRowSkeleton key={i} />
            ))}
          </ul>
        }
      >
        {body}
      </LoadingSwap>

      {editing && (
        <TagFormModal
          initial={editing}
          title={editing.name}
          onSave={(name, color) => handleSave(editing.id, name, color)}
          onCancel={() => setEditing(null)}
          onDelete={() => setConfirmDelete(editing)}
          saving={savingId === editing.id}
          deleting={deletingId === editing.id}
          nameLabel={t("tag.name")}
          colorLabel={t("tag.color")}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          deleteLabel={t("common.delete")}
        />
      )}

      {creating && (
        <TagFormModal
          initial={null}
          title={t("tag.add")}
          onSave={(name, color) => handleCreate(name, color)}
          onCancel={() => setCreating(false)}
          saving={savingId === -1}
          nameLabel={t("tag.name")}
          colorLabel={t("tag.color")}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
        />
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title={t("common.delete")}
        message={t("tag.delete_confirm", { name: confirmDelete?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        busy={deletingId !== null}
        onConfirm={() => {
          if (confirmDelete) return handleDelete(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

export default withLang(TagsView);
