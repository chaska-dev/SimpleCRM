import { useState, useMemo, useCallback } from "react";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import type { Attachment } from "../../../types";
import Modal from "./Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import { formatBytes, formatDate, formatRelative } from "./helpers";
import EmptyState from "../../ui/EmptyState";
import { LoadingSwap, AttachmentGridSkeleton, Skeleton } from "../../ui";
import { IconByKey } from "../../ui/icons";
import { Download, Paperclip, Plus, Trash2 } from "lucide-react";

interface Props {
  personId: number;
  attachments: Attachment[] | null;
  onReload: () => Promise<void>;
}

type SubjectGroup = "person" | "note" | "date" | "interaction";

const SUBJECT_LABELS: Record<SubjectGroup, string> = {
  person: "attachment.subject_person",
  note: "attachment.subject_note",
  date: "attachment.subject_date",
  interaction: "attachment.subject_interaction",
};

const SUBJECT_TYPES: SubjectGroup[] = ["person", "note", "date", "interaction"];

function parseSubjectType(raw: string): SubjectGroup {
  // raw is "app_label.model", e.g. "crm.person".
  if (raw.endsWith(".person")) return "person";
  if (raw.endsWith(".note")) return "note";
  if (raw.endsWith(".importantdate")) return "date";
  if (raw.endsWith(".interaction")) return "interaction";
  return "person";
}

/**
 * AttachmentsTab — gallery grouped by subject.
 *
 * - Tile: preview thumbnail (image) or icon + filename + size.
 * - Click tile: modal with full preview + download button
 *   (`/api/attachments/{id}/download/`).
 * - "Upload attachment" button: file picker + subject selector (default person).
 *   POST `/api/attachments/`.
 */
export default function AttachmentsTab({
  personId,
  attachments,
  onReload,
}: Props) {
  const { t } = useTranslation();
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<SubjectGroup, Attachment[]> = {
      person: [],
      note: [],
      date: [],
      interaction: [],
    };
    if (attachments) {
      for (const a of attachments) {
        const key = parseSubjectType(a.subject_type);
        groups[key].push(a);
      }
    }
    return groups;
  }, [attachments]);

  const onDelete = useCallback(
    async (a: Attachment) => {
      try {
        await apiFetch<void>(`/api/attachments/${a.id}/`, { method: "DELETE" });
        toast.success(t("attachment.deleted"));
        setPendingDelete(null);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
        setPendingDelete(null);
      }
    },
    [onReload, t],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          className="neo-btn neo-btn-sm"
          onClick={() => setShowUpload(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("attachment.upload")}
        </button>
      </div>

      <LoadingSwap
        loading={attachments === null}
        label={t("common.loading")}
        skeleton={
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <AttachmentGridSkeleton count={4} />
          </div>
        }
      >
        {attachments === null ? null : attachments.length === 0 ? (
          <EmptyState icon={Paperclip} title={t("attachment.empty")} />
        ) : (
          <div className="space-y-6">
            {SUBJECT_TYPES.map((group) =>
            grouped[group].length === 0 ? null : (
              <section key={group}>
                <h3 className="mb-3 text-sm font-semibold">
                  {t(SUBJECT_LABELS[group])}
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {grouped[group].map((a) => (
                    <AttachmentTile
                      key={a.id}
                      attachment={a}
                      onPreview={() => setPreviewing(a)}
                      onDelete={() => setPendingDelete(a)}
                    />
                  ))}
                </div>
              </section>
            ),
            )}
          </div>
        )}
      </LoadingSwap>

      {previewing && (
        <PreviewModal
          attachment={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        personId={personId}
        onUploaded={async () => {
          setShowUpload(false);
          await onReload();
        }}
      />
      <ConfirmModal
        open={pendingDelete !== null}
        title={t("common.delete")}
        message={
          pendingDelete
            ? `${pendingDelete.original_filename || pendingDelete.title}. ${t("common.confirm_delete")}`
            : ""
        }
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

function AttachmentTile({
  attachment,
  onPreview,
  onDelete,
}: {
  attachment: Attachment;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useTranslation();
  const isImage = attachment.mime_type.startsWith("image/");
  const size = formatBytes(attachment.size_bytes);

  return (
    <div className="neo-card overflow-hidden flex flex-col">
      <button
        type="button"
        className="block w-full"
        onClick={onPreview}
        aria-label={attachment.original_filename || attachment.title}
      >
        {isImage ? (
          <img
            src={`/api/attachments/${attachment.id}/thumb/?w=300`}
            alt=""
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center bg-muted text-fg-muted">
            <IconByKey name={iconKeyForMime(attachment.mime_type)} className="size-8" />
          </div>
        )}
      </button>
      <div className="flex items-center gap-2 p-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {attachment.original_filename || attachment.title}
          </div>
          <div className="text-xs text-fg-muted tabular-nums">
            {size.unit === "B"
              ? t("attachment.size_bytes", { n: size.value })
              : size.unit === "KB"
                ? t("attachment.size_kb", { n: size.value })
                : size.unit === "MB"
                  ? t("attachment.size_mb", { n: size.value })
                  : t("attachment.size_gb", { n: size.value })}
            {" · "}
            <span title={formatDate(attachment.uploaded_at, lang)}>
              {formatRelative(attachment.uploaded_at, lang)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={onDelete}
          aria-label={t("common.delete")}
          title={t("common.delete")}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
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

function PreviewModal({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const { t, lang } = useTranslation();
  const isImage = attachment.mime_type.startsWith("image/");
  return (
    <Modal
      open
      onClose={onClose}
      title={attachment.original_filename || attachment.title}
      size="lg"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose}>
            {t("attachment.close_preview")}
          </button>
          <a
            className="neo-btn neo-btn-primary no-underline"
            href={`/api/attachments/${attachment.id}/download/`}
            download
          >
            <Download className="size-4" aria-hidden="true" />
            {t("attachment.download")}
          </a>
        </>
      }
    >
      <div className="space-y-4">
        {isImage ? (
          <img
            src={`/api/attachments/${attachment.id}/thumb/?w=900`}
            alt=""
            className="w-full rounded-lg border border-border"
          />
        ) : (
          <div className="flex min-h-80 items-center justify-center rounded-lg bg-muted text-fg-muted">
            <IconByKey name={iconKeyForMime(attachment.mime_type)} className="size-8" />
          </div>
        )}
        {attachment.description && (
          <p className="text-sm">{attachment.description}</p>
        )}
        <div className="text-xs text-fg-muted tabular-nums">
          {attachment.mime_type} · {formatBytes(attachment.size_bytes).value}{" "}
          {formatBytes(attachment.size_bytes).unit} ·{" "}
          {formatDate(attachment.uploaded_at, lang)}
        </div>
      </div>
    </Modal>
  );
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
  personId: number;
}

function UploadModal({ open, onClose, onUploaded, personId }: UploadModalProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState<SubjectGroup>("person");
  const [busy, setBusy] = useState(false);

  const subjectTypeValue = useMemo(() => {
    switch (subject) {
      case "person":
        return "crm.person";
      case "note":
        return "crm.note";
      case "date":
        return "crm.importantdate";
      case "interaction":
        return "crm.interaction";
    }
  }, [subject]);

  // For "note"/"date"/"interaction" subject_id is not requested today — we use person
  // as the anchor until the backend accepts polymorphic subject_id in the form.
  const subjectId = personId;

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subject_type", subjectTypeValue);
      fd.append("subject_id", String(subjectId));
      if (title.trim()) fd.append("title", title.trim());
      if (description.trim()) fd.append("description", description.trim());
      // Mime hint for the backend (the form parser also infers it).
      fd.append("mime_type", file.type || "application/octet-stream");
      await apiFetch<Attachment>(`/api/attachments/`, { method: "POST", body: fd });
      toast.success(t("attachment.upload_done"));
      setFile(null);
      setTitle("");
      setDescription("");
      setSubject("person");
      await onUploaded();
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("attachment.upload")}
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
            disabled={busy || !file}
          >
            {busy ? t("attachment.uploading") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("attachment.select_file")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            type="file"
            className="neo-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("attachment.choose_subject")}
          </span>
          <select
            className="neo-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectGroup)}
          >
            {SUBJECT_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(SUBJECT_LABELS[s])}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("contact_info.label")}
          </span>
          <input
            className="neo-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("date.fields.description")}
          </span>
          <textarea
            className="neo-input min-h-16"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}