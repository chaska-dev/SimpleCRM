import { useState, useCallback } from "react";
import { Camera, Pencil, Trash2, Plus } from "lucide-react";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import type { ContactInfo, ContactInfoCreate, Person } from "../../../types";
import Modal from "./Modal";
import Avatar from "../../ui/Avatar";
import { IconByKey } from "../../ui/icons";
import ConfirmModal from "../../ui/ConfirmModal";
import { MB, appendCrop, useImagePicker } from "../../ui/ImagePicker";
import { BorderedListSkeleton, ContactInfoRowSkeleton, LoadingSwap } from "../../ui";
import PersonOrganizationsSection from "./PersonOrganizationsSection";
import {
  CONTACT_TYPE_SUGGESTIONS,
  contactTypeLabel,
  displayName,
  iconForContactType,
  formatDate,
  formatRelative,
} from "./helpers";

interface Props {
  personId: number;
  contacts: ContactInfo[] | null;
  person: Person;
  onReload: () => Promise<void>;
  onPersonUpdate: (p: Person) => void;
}

/**
 * ContactTab — ContactInfo list + "How we met" section.
 *
 * - Add inline form (type selector + value + label).
 * - Edit inline (click the pencil → inputs).
 * - Delete with confirm.
 * - "How we met" is a textarea that PATCHes the person.
 * - "Profile photo" — Avatar + Change/Remove photo. useImagePicker validates the file and
 *   opens the round crop; on save it does a multipart POST to
 *   /api/persons/{id}/profile_photo/ (original file + crop_x/y/w/h) and DELETE to remove it.
 */

const PHOTO_MAX_BYTES = 5 * MB;
export default function ContactTab({
  personId,
  contacts,
  person,
  onReload,
  onPersonUpdate,
}: Props) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContactInfo | null>(null);
  const [howWeMetDraft, setHowWeMetDraft] = useState(person.how_we_met);
  const [howWeMetDirty, setHowWeMetDirty] = useState(false);
  const [savingHowWeMet, setSavingHowWeMet] = useState(false);

  const onAdd = useCallback(
    async (payload: ContactInfoCreate) => {
      try {
        await apiFetch<ContactInfo>(`/api/persons/${personId}/contacts-info/`, {
          method: "POST",
          body: payload,
        });
        toast.success(t("contact_info.added"));
        setShowAdd(false);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [personId, onReload, t],
  );

  const onEdit = useCallback(
    async (c: ContactInfo, payload: Partial<ContactInfoCreate>) => {
      try {
        await apiFetch<ContactInfo>(`/api/persons/${personId}/contacts-info/${c.id}/`, {
          method: "PATCH",
          body: payload,
        });
        toast.success(t("contact_info.updated"));
        setEditingId(null);
        await onReload();
      } catch (e) {
        const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
        toast.error(msg);
      }
    },
    [personId, onReload, t],
  );

  const onDelete = useCallback(
    async (c: ContactInfo) => {
      try {
        await apiFetch<void>(`/api/persons/${personId}/contacts-info/${c.id}/`, {
          method: "DELETE",
        });
        toast.success(t("contact_info.deleted"));
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

  const handleSaveHowWeMet = async () => {
    setSavingHowWeMet(true);
    try {
      const updated = await apiFetch<Person>(`/api/persons/${person.id}/`, {
        method: "PATCH",
        body: { how_we_met: howWeMetDraft },
      });
      onPersonUpdate(updated);
      setHowWeMetDirty(false);
      toast.success(t("messages.saved"));
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : t("messages.error_generic");
      toast.error(msg);
    } finally {
      setSavingHowWeMet(false);
    }
  };

  const [removingPhoto, setRemovingPhoto] = useState(false);

  const picker = useImagePicker({
    variant: "avatar",
    maxBytes: PHOTO_MAX_BYTES,
    onConfirm: async ({ file, crop }) => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        appendCrop(fd, crop);
        const updated = await apiFetch<Person>(`/api/persons/${personId}/profile_photo/`, {
          method: "POST",
          body: fd,
        });
        onPersonUpdate(updated);
        toast.success(t("person.profile_photo.saved"));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.detail : t("messages.error_generic"));
        throw e;
      }
    },
  });

  const handlePhotoRemove = async () => {
    setRemovingPhoto(true);
    try {
      await apiFetch<void>(`/api/persons/${personId}/profile_photo/`, { method: "DELETE" });
      onPersonUpdate({ ...person, profile_photo: null });
      toast.success(t("person.profile_photo.removed"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : t("messages.error_generic"));
    } finally {
      setRemovingPhoto(false);
    }
  };

  return (
    <div className="divide-y divide-border">
      {/* ====== Profile photo ====== */}
      <section className="py-5 first:pt-0">
        <h3 className="text-sm font-semibold">{t("person.fields.profile_photo")}</h3>
        <div className="mt-4 flex items-center gap-4">
          <Avatar name={displayName(person)} photoId={person.profile_photo} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="neo-btn neo-btn-sm"
                onClick={picker.open}
                disabled={picker.busy || removingPhoto}
              >
                <Camera className="size-4" aria-hidden="true" />{" "}
                {t(person.profile_photo ? "person.profile_photo.change" : "person.profile_photo.choose")}
              </button>
              {person.profile_photo && (
                <button
                  type="button"
                  className="neo-btn neo-btn-sm neo-btn-ghost"
                  onClick={handlePhotoRemove}
                  disabled={picker.busy || removingPhoto}
                >
                  {t("person.profile_photo.remove")}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">{t("person.profile_photo.help")}</p>
            {picker.error && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-accent">
                {picker.error}
              </p>
            )}
          </div>
          {picker.input}
        </div>
        {picker.modal}
      </section>

      {/* ====== Contact info ====== */}
      <section className="py-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">{t("contact_info.section")}</h3>
          <button
            type="button"
            className="neo-btn neo-btn-sm"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-4" aria-hidden="true" /> {t("contact_info.add")}
          </button>
        </div>
        <LoadingSwap
          loading={contacts === null}
          label={t("common.loading")}
          skeleton={<BorderedListSkeleton rows={3} row={() => <ContactInfoRowSkeleton />} />}
        >
        {contacts === null ? null : contacts.length === 0 ? (
          <p className="text-xs text-fg-muted">{t("contact_info.empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                editing={editingId === c.id}
                onStartEdit={() => setEditingId(c.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(payload) => onEdit(c, payload)}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </ul>
        )}
        </LoadingSwap>
      </section>

      {/* ====== Organizations ====== */}
      <PersonOrganizationsSection person={person} onPersonUpdate={onPersonUpdate} />

      {/* ====== How we met ====== */}
      <section className="py-5 last:pb-0">
        <h3 className="mb-4 text-sm font-semibold">{t("person.fields.how_we_met")}</h3>
        <textarea
          className="neo-input min-h-24"
          value={howWeMetDraft}
          onChange={(e) => {
            setHowWeMetDraft(e.target.value);
            setHowWeMetDirty(e.target.value !== person.how_we_met);
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          {howWeMetDirty && (
            <button
              type="button"
              className="neo-btn neo-btn-sm"
              onClick={() => {
                setHowWeMetDraft(person.how_we_met);
                setHowWeMetDirty(false);
              }}
              disabled={savingHowWeMet}
            >
              {t("common.cancel")}
            </button>
          )}
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={handleSaveHowWeMet}
            disabled={!howWeMetDirty || savingHowWeMet}
          >
            {savingHowWeMet ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </section>

      <AddContactModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={onAdd}
      />
      <ConfirmModal
        open={pendingDelete !== null}
        title={t("common.delete")}
        message={pendingDelete ? `${t("contact_info.deleted")}: ${pendingDelete.value}` : ""}
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

interface RowProps {
  contact: ContactInfo;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: Partial<ContactInfoCreate>) => Promise<void>;
  onDelete: () => void;
}

function ContactRow({
  contact,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: RowProps) {
  const { t, lang } = useTranslation();
  const [typeKey, setTypeKey] = useState(contact.type);
  const [value, setValue] = useState(contact.value);
  const [label, setLabel] = useState(contact.label);
  const [busy, setBusy] = useState(false);

  const icon = iconForContactType(contact.type);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ type: typeKey, value, label });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <select
            className="neo-input min-w-40 flex-1"
            value={typeKey}
            onChange={(e) => setTypeKey(e.target.value)}
            aria-label={t("contact_info.type")}
          >
            {CONTACT_TYPE_SUGGESTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.label)}
              </option>
            ))}
          </select>
          <input
            className="neo-input min-w-40 flex-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("contact_info.value")}
            aria-label={t("contact_info.value")}
          />
          <input
            className="neo-input min-w-32 flex-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("contact_info.label")}
            aria-label={t("contact_info.label")}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="neo-btn neo-btn-sm" onClick={onCancelEdit} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={save}
            disabled={busy || !value.trim()}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted"
      >
        <IconByKey name={icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-fg-muted">
          {contactTypeLabel(t, contact)}
          {contact.label && ` · ${contact.label}`}
        </p>
        <p className="break-words text-sm font-medium">{contact.value}</p>
      </div>
      <span
        className="hidden shrink-0 text-xs text-fg-muted tabular-nums sm:inline"
        title={formatDate(contact.created_at, lang)}
      >
        {formatRelative(contact.created_at, lang)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-icon"
          onClick={onStartEdit}
          aria-label={t("common.edit")}
          title={t("common.edit")}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
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
    </li>
  );
}

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: ContactInfoCreate) => Promise<void>;
}

function AddContactModal({ open, onClose, onAdd }: AddModalProps) {
  const { t } = useTranslation();
  const [typeKey, setTypeKey] = useState(CONTACT_TYPE_SUGGESTIONS[0].key);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onAdd({ type: typeKey, value: value.trim(), label: label.trim() });
      // Reset on success — modal will close.
      setValue("");
      setLabel("");
    } catch {
      // Already toasted by parent.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("contact_info.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={handleSubmit}
            disabled={busy || !value.trim()}
          >
            {busy ? t("common.saving") : t("contact_info.save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("contact_info.type")}</span>
          <select
            className="neo-input"
            value={typeKey}
            onChange={(e) => setTypeKey(e.target.value)}
          >
            {CONTACT_TYPE_SUGGESTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("contact_info.value")}
            <span className="ml-1 text-accent">*</span>
          </span>
          <input
            className="neo-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {t("contact_info.label")}{" "}
            <span className="font-normal text-fg-muted">({t("common.optional")})</span>
          </span>
          <input
            className="neo-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("contact_info.label_placeholder")}
          />
        </label>
      </div>
    </Modal>
  );
}
