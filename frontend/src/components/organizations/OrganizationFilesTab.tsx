/**
 * OrganizationFilesTab — photos and files of an organization.
 *
 * Same pattern as the person's AttachmentsTab, with `subject_type=organization`:
 * image grid with thumbnails + document list. Upload, view
 * (images), download and delete.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ImageIcon, Plus, Trash2 } from "lucide-react";
import type { Attachment } from "../../types";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import Modal from "../persons/detail/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import { formatBytes, formatDate, formatRelative } from "../persons/detail/helpers";
import { IconByKey } from "../ui/icons";
import EmptyState from "../ui/EmptyState";
import { LoadingSwap, OrganizationFilesSkeleton } from "../ui";

interface Props {
  organizationId: number;
}

function iconKeyForMime(mime: string): string {
  if (mime.startsWith("image/")) return "file-image";
  if (mime.startsWith("video/")) return "file-video";
  if (mime.startsWith("audio/")) return "file-audio";
  if (mime === "application/pdf") return "file-pdf";
  if (mime.includes("zip") || mime.includes("compressed")) return "file-archive";
  if (mime.startsWith("text/")) return "file-text";
  return "file-other";
}

function sizeLabel(
  t: (k: string, v?: Record<string, string | number>) => string,
  bytes: number,
): string {
  const s = formatBytes(bytes);
  const key =
    s.unit === "B"
      ? "attachment.size_bytes"
      : s.unit === "KB"
        ? "attachment.size_kb"
        : s.unit === "MB"
          ? "attachment.size_mb"
          : "attachment.size_gb";
  return t(key, { n: s.value });
}

export default function OrganizationFilesTab({ organizationId }: Props) {
  const { t, lang } = useTranslation();
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<Attachment[]>(
        `/api/attachments/?subject_type=organization&subject_id=${organizationId}`,
      );
      setItems(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("messages.error_generic"));
    }
  }, [organizationId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { images, documents } = useMemo(() => {
    const list = items ?? [];
    return {
      images: list.filter((a) => a.mime_type.startsWith("image/")),
      documents: list.filter((a) => !a.mime_type.startsWith("image/")),
    };
  }, [items]);

  const handleDelete = async (a: Attachment) => {
    try {
      await apiFetch<void>(`/api/attachments/${a.id}/`, { method: "DELETE" });
      toast.success(t("attachment.deleted"));
      setRemoving(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setRemoving(null);
    }
  };

  const uploadButton = (
    <button type="button" className="neo-btn neo-btn-sm" onClick={() => setUploading(true)}>
      <Plus className="size-4" aria-hidden="true" />
      {t("attachment.upload")}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold">{t("organization.tabs.files")}</h3>
        {items !== null && items.length > 0 && uploadButton}
      </div>

      <LoadingSwap
        loading={!loadError && items === null}
        label={t("common.loading")}
        skeleton={<OrganizationFilesSkeleton />}
      >
      {loadError ? (
        <p role="alert" className="text-sm font-medium text-status-overdue-fg">
          {loadError}
        </p>
      ) : items === null ? null : items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={t("organization.files.empty_title")}
          description={t("organization.files.empty")}
          action={uploadButton}
        />
      ) : (
        <div className="space-y-6">
          {images.length > 0 && (
            <section className="space-y-4">
              <h4 className="text-xs font-medium text-fg-muted">
                {t("organization.files.photos")}
              </h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {images.map((a) => (
                  <div key={a.id} className="neo-card group relative overflow-hidden">
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => setPreviewing(a)}
                      aria-label={a.original_filename || a.title}
                    >
                      <img
                        src={`/api/attachments/${a.id}/thumb/?w=300`}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger absolute right-1 top-1 bg-surface shadow-sm"
                      onClick={() => setRemoving(a)}
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section className="space-y-4">
              <h4 className="text-xs font-medium text-fg-muted">
                {t("organization.files.documents")}
              </h4>
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {documents.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"
                    >
                      <IconByKey name={iconKeyForMime(a.mime_type)} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.title || a.original_filename}
                      </p>
                      <p className="truncate text-xs text-fg-muted tabular-nums">
                        {sizeLabel(t, a.size_bytes)}
                        {" · "}
                        <span title={formatDate(a.uploaded_at, lang)}>
                          {formatRelative(a.uploaded_at, lang)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/api/attachments/${a.id}/download/`}
                        download
                        className="btn-icon"
                        aria-label={t("attachment.download")}
                        title={t("attachment.download")}
                      >
                        <Download className="size-4" aria-hidden="true" />
                      </a>
                      <button
                        type="button"
                        className="btn-icon btn-icon-danger"
                        onClick={() => setRemoving(a)}
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      </LoadingSwap>

      {previewing && (
        <Modal
          open
          onClose={() => setPreviewing(null)}
          title={previewing.title || previewing.original_filename}
          size="lg"
          footer={
            <>
              <button type="button" className="neo-btn" onClick={() => setPreviewing(null)}>
                {t("attachment.close_preview")}
              </button>
              <a
                className="neo-btn neo-btn-primary no-underline"
                href={`/api/attachments/${previewing.id}/download/`}
                download
              >
                <Download className="size-4" aria-hidden="true" />
                {t("attachment.download")}
              </a>
            </>
          }
        >
          <div className="space-y-4">
            <img
              src={`/api/attachments/${previewing.id}/thumb/?w=900`}
              alt=""
              className="w-full rounded-lg border border-border"
            />
            {previewing.description && <p className="text-sm">{previewing.description}</p>}
            <p className="text-xs text-fg-muted tabular-nums">
              {sizeLabel(t, previewing.size_bytes)} · {formatDate(previewing.uploaded_at, lang)}
            </p>
          </div>
        </Modal>
      )}

      {uploading && (
        <UploadModal
          organizationId={organizationId}
          onClose={() => setUploading(false)}
          onUploaded={async () => {
            setUploading(false);
            await reload();
          }}
        />
      )}

      <ConfirmModal
        open={removing !== null}
        title={t("common.delete")}
        message={
          removing
            ? `${removing.original_filename || removing.title}. ${t("common.confirm_delete")}`
            : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => (removing ? handleDelete(removing) : undefined)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function UploadModal({
  organizationId,
  onClose,
  onUploaded,
}: {
  organizationId: number;
  onClose: () => void;
  onUploaded: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subject_type", "crm.organization");
      fd.append("subject_id", String(organizationId));
      // The backend requires a title: if empty, the file name is used.
      fd.append("title", title.trim() || file.name.slice(0, 150));
      if (description.trim()) fd.append("description", description.trim());
      fd.append("mime_type", file.type || "application/octet-stream");
      await apiFetch<Attachment>("/api/attachments/", { method: "POST", body: fd });
      toast.success(t("attachment.upload_done"));
      await onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("attachment.upload")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="organization-upload-form"
            className="neo-btn neo-btn-primary"
            disabled={busy || !file}
          >
            {busy ? t("attachment.uploading") : t("common.save")}
          </button>
        </>
      }
    >
      <form id="organization-upload-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="org-file" className="mb-1.5 block text-sm font-medium">
            {t("attachment.select_file")}
          </label>
          <input
            id="org-file"
            type="file"
            className="neo-input h-auto py-1.5"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label htmlFor="org-file-title" className="mb-1.5 block text-sm font-medium">
            {t("organization.files.title_label")}
          </label>
          <input
            id="org-file-title"
            type="text"
            className="neo-input"
            value={title}
            maxLength={150}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="org-file-desc" className="mb-1.5 block text-sm font-medium">
            {t("date.fields.description")}
          </label>
          <textarea
            id="org-file-desc"
            className="neo-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
