/**
 * OrganizationForm — organization fields, shared by the
 * /organizations/new/ page and the edit modal.
 *
 * It renders no buttons: the container uses `formId` (submit with
 * `<button type="submit" form={formId}>`). On submit it delivers an
 * `OrganizationFormValues`; the consumer decides how to save (JSON for the
 * fields, separate multipart PATCH for the logo).
 *
 * Logo: useImagePicker validates the file and opens the square crop with preview;
 * the original + the rectangle are sent when the form is saved.
 */
import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { Organization, OrganizationKind, Tag } from "../../types";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { CropPreview } from "../ui/ImageCropModal";
import { useImagePicker, type CropRect, type PickResult } from "../ui/ImagePicker";
import OrgLogo from "./OrgLogo";
import { LOGO_MAX_BYTES, ORGANIZATION_KINDS } from "./organizationUtils";

export interface OrganizationFormValues {
  fields: {
    name: string;
    kind: OrganizationKind;
    address: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    notes: string;
    tag_ids: number[];
  };
  /** New original file chosen, or null. */
  logoFile: File | null;
  /** Crop (pixels of the original image) of the new file, or null. */
  logoCrop: CropRect | null;
  /** true if there was a logo and the user asked to remove it (without replacement). */
  removeLogo: boolean;
}

interface Props {
  formId: string;
  initial?: Organization | null;
  tags: Tag[];
  onTagCreated?: (tag: Tag) => void;
  onSubmit: (values: OrganizationFormValues) => void | Promise<void>;
  /** Error to display (comes from the container after a save attempt). */
  error?: string | null;
}

export default function OrganizationForm({
  formId,
  initial = null,
  tags,
  onTagCreated,
  onSubmit,
  error,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<OrganizationKind>(initial?.kind ?? "other");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagIds, setTagIds] = useState<number[]>(initial?.tags.map((x) => x.id) ?? []);
  const [newTag, setNewTag] = useState("");

  const [logoPick, setLogoPick] = useState<PickResult | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Preview of the chosen file before saving; released on change or unmount.
  useEffect(() => {
    if (!logoPick) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoPick.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoPick]);

  const picker = useImagePicker({
    variant: "logo",
    maxBytes: LOGO_MAX_BYTES,
    onConfirm: (result) => {
      setLogoPick(result);
      setRemoveLogo(false);
    },
  });

  const clearLogo = () => {
    picker.clearError();
    if (logoPick) {
      setLogoPick(null);
    } else if (initial?.logo) {
      setRemoveLogo(true);
    }
  };

  const toggleTag = (id: number) =>
    setTagIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const createTag = async () => {
    const tagName = newTag.trim();
    if (!tagName) return;
    try {
      const created = await apiFetch<Tag>("/api/tags/", {
        method: "POST",
        body: { name: tagName, color: "#7c3aed" },
      });
      onTagCreated?.(created);
      setTagIds((cur) => Array.from(new Set([...cur, created.id])));
      setNewTag("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t("messages.error_generic"));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError(t("organization.errors.name_required"));
      return;
    }
    setLocalError(null);
    void onSubmit({
      fields: {
        name: name.trim(),
        kind,
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        notes,
        tag_ids: tagIds,
      },
      logoFile: logoPick?.file ?? null,
      logoCrop: logoPick?.crop ?? null,
      removeLogo,
    });
  };

  // Displayed logo: preview > current logo (if removal was not requested) > initials.
  const showingCurrent = !logoPick && !removeLogo && !!initial?.logo;
  const hasLogo = !!logoPick || showingCurrent;
  const shownError = localError ?? error ?? null;

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* ===== Logo ===== */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t("organization.fields.logo")}</h2>
        <div className="flex items-center gap-4">
          {previewUrl && logoPick ? (
            <CropPreview
              src={previewUrl}
              width={logoPick.width}
              height={logoPick.height}
              crop={logoPick.crop}
              size={64}
              radius="var(--radius-lg)"
            />
          ) : (
            <OrgLogo
              org={{
                name: name || "?",
                logo: showingCurrent ? (initial?.logo ?? null) : null,
                updated_at: initial?.updated_at ?? "",
              }}
              size="lg"
            />
          )}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="neo-btn neo-btn-sm" onClick={picker.open}>
                <ImagePlus className="size-4" aria-hidden="true" />
                {t(hasLogo ? "organization.logo.change" : "organization.logo.choose")}
              </button>
              {picker.input}
              {hasLogo && (
                <button
                  type="button"
                  className="btn-icon btn-icon-danger"
                  onClick={clearLogo}
                  aria-label={t("organization.logo.remove")}
                  title={t("organization.logo.remove")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-xs text-fg-muted">{t("organization.logo.help")}</p>
            {picker.error && (
              <p role="alert" className="text-xs font-medium text-accent">
                {picker.error}
              </p>
            )}
          </div>
        </div>
        {picker.modal}
      </section>

      {/* ===== Basic data ===== */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t("organization.form.section_basics")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("organization.fields.name")} htmlFor={`${formId}-name`} required>
            <input
              id={`${formId}-name`}
              type="text"
              className="neo-input"
              value={name}
              maxLength={150}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label={t("organization.fields.kind")} htmlFor={`${formId}-kind`}>
            <select
              id={`${formId}-kind`}
              className="neo-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as OrganizationKind)}
            >
              {ORGANIZATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`enums.organization.kind.${k}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("organization.fields.address")} htmlFor={`${formId}-address`}>
          <input
            id={`${formId}-address`}
            type="text"
            className="neo-input"
            value={address}
            maxLength={255}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("organization.fields.city")} htmlFor={`${formId}-city`}>
            <input
              id={`${formId}-city`}
              type="text"
              className="neo-input"
              value={city}
              maxLength={100}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label={t("organization.fields.country")} htmlFor={`${formId}-country`}>
            <input
              id={`${formId}-country`}
              type="text"
              className="neo-input"
              value={country}
              maxLength={100}
              onChange={(e) => setCountry(e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* ===== Contact ===== */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t("organization.form.section_contact")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("organization.fields.phone")} htmlFor={`${formId}-phone`}>
            <input
              id={`${formId}-phone`}
              type="tel"
              className="neo-input"
              value={phone}
              maxLength={50}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label={t("organization.fields.email")} htmlFor={`${formId}-email`}>
            <input
              id={`${formId}-email`}
              type="email"
              className="neo-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("organization.fields.website")} htmlFor={`${formId}-website`}>
          <input
            id={`${formId}-website`}
            type="url"
            className="neo-input"
            value={website}
            placeholder="https://"
            onChange={(e) => setWebsite(e.target.value)}
          />
        </Field>
        <Field label={t("organization.fields.notes")} htmlFor={`${formId}-notes`}>
          <textarea
            id={`${formId}-notes`}
            rows={3}
            className="neo-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </section>

      {/* ===== Tags ===== */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t("organization.fields.tags")}</h2>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const selected = tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={selected}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-transparent bg-primary-soft text-primary-soft-fg"
                    : "border-border bg-surface text-fg-muted hover:bg-muted hover:text-fg"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            );
          })}
          {tags.length === 0 && <p className="text-xs text-fg-muted">{t("tag.empty")}</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="neo-input"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createTag();
              }
            }}
            placeholder={t("person.form.tag_create_placeholder")}
            aria-label={t("person.form.tag_create_placeholder")}
          />
          <button
            type="button"
            className="neo-btn shrink-0"
            onClick={() => void createTag()}
            disabled={!newTag.trim()}
          >
            {t("person.form.tag_create_action")}
          </button>
        </div>
      </section>

      {shownError && (
        <p
          role="alert"
          className="rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg"
        >
          {shownError}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {children}
    </div>
  );
}
