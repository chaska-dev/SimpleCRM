import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation, withLang } from "../../../i18n";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import type { Tag, PersonCreate, ContactInfoCreate } from "../../../types";

interface Props {
  initialLang?: "es" | "en";
  /** alias for `initialLang` (compatibility with the project convention). */
  lang?: "es" | "en";
  existingTags: Tag[];
}

interface DraftContact {
  type: string;
  value: string;
  label: string;
}

/** Suggested contact types. The visible name comes from `enums.contact.types.<key>`. */
const CONTACT_TYPE_SUGGESTIONS: Array<{ key: string }> = [
  { key: "personal_phone" },
  { key: "personal_email" },
  { key: "work_phone" },
  { key: "work_email" },
  { key: "whatsapp" },
  { key: "telegram" },
  { key: "instagram" },
  { key: "facebook" },
  { key: "x" },
  { key: "linkedin" },
  { key: "discord" },
  { key: "other" },
];

function emailLooksValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function PersonCreateForm({ existingTags }: Props) {
  const { t } = useTranslation();

  // ===== basic =====
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickName, setNickName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [howWeMet, setHowWeMet] = useState("");
  const [cadenceDays, setCadenceDays] = useState("");

  // ===== tags =====
  const [availableTags, setAvailableTags] = useState<Tag[]>(existingTags);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagToCreate, setTagToCreate] = useState("");

  // ===== contacts =====
  const [contacts, setContacts] = useState<DraftContact[]>(
    CONTACT_TYPE_SUGGESTIONS.slice(0, 3).map((c) => ({ type: c.key, value: "", label: "" })),
  );

  // ===== submit state =====
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(id: number) {
    setSelectedTagIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function setContactField(idx: number, field: keyof DraftContact, value: string) {
    setContacts((cur) => {
      const next = cur.slice();
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addContactRow() {
    setContacts((cur) => {
      // use the first type that does not appear yet; if all are used, fall back to "other".
      const used = new Set(cur.map((c) => c.type));
      const next = CONTACT_TYPE_SUGGESTIONS.find((s) => !used.has(s.key))?.key ?? "other";
      return [...cur, { type: next, value: "", label: "" }];
    });
  }

  function removeContactRow(idx: number) {
    setContacts((cur) => cur.filter((_, i) => i !== idx));
  }

  async function handleCreateTag() {
    const name = tagToCreate.trim();
    if (!name) return;
    try {
      const created = await apiFetch<Tag>("/api/tags/", {
        method: "POST",
        body: { name, color: "#7c3aed" },
      });
      setAvailableTags((cur) => [...cur, created]);
      setSelectedTagIds((cur) => Array.from(new Set([...cur, created.id])));
      setTagToCreate("");
      toast.success(t("tag.created", { name }));
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(`${t("tag.create_failed")}: ${err.detail}`);
      } else {
        toast.error(t("messages.error_generic"));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fname = firstName.trim();
    if (!fname) {
      setError(t("person.form.errors.first_name_required"));
      return;
    }

    setBusy(true);
    try {
      const payload: PersonCreate = {
        first_name: fname,
        last_name: lastName.trim() || undefined,
        nick_name: nickName.trim() || undefined,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
        how_we_met: howWeMet.trim() || undefined,
        cadence_days: cadenceDays ? Number(cadenceDays) : null,
        tag_ids: selectedTagIds,
      };

      const created = await apiFetch<{ id: number }>("/api/persons/", {
        method: "POST",
        body: payload,
      });

      // Create filled contacts (non-empty type + value).
      const filledContacts = contacts.filter(
        (c) => c.type.trim() && c.value.trim(),
      );

      for (const c of filledContacts) {
        const body: ContactInfoCreate = {
          type: c.type,
          value: c.value.trim(),
          label: c.label.trim() || undefined,
        };
        // Email validation if the type is *email.
        const isEmailType = c.type.endsWith("_email") || c.type === "personal_email" || c.type === "work_email";
        if (isEmailType && !emailLooksValid(body.value)) {
          toast.warning(
            t("person.form.errors.contact_invalid_email", {
              type: t(`enums.contact.types.${c.type}`),
            }),
          );
          continue;
        }
        try {
          await apiFetch(`/api/persons/${created.id}/contacts-info/`, {
            method: "POST",
            body,
          });
        } catch (err) {
          if (err instanceof ApiError) {
            toast.warning(`${t("person.form.errors.contact_failed")} (${err.detail})`);
          }
        }
      }

      toast.success(t("person.added"));
      window.location.href = `/persons/${created.id}/`;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${t("person.form.errors.create_failed")}: ${err.detail}`);
      } else {
        setError(t("person.form.errors.create_failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">{t("person.form.new_person")}</h1>

      {/* ===== Basic data ===== */}
      <section className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">
          {t("person.form.section_basics")}
        </h2>

        <Field label={t("person.fields.first_name")} required htmlFor="first_name">
          <input
            id="first_name"
            type="text"
            className="neo-input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label={t("person.fields.last_name")} htmlFor="last_name">
          <input
            id="last_name"
            type="text"
            className="neo-input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.nick_name")} htmlFor="nick_name">
          <input
            id="nick_name"
            type="text"
            className="neo-input"
            value={nickName}
            onChange={(e) => setNickName(e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.company")} htmlFor="company">
          <input
            id="company"
            type="text"
            className="neo-input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.role")} htmlFor="role">
          <input
            id="role"
            type="text"
            className="neo-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </Field>

        <Field
          label={t("person.fields.cadence_days")}
          htmlFor="cadence_days"
          hint={t("person.form.cadence_help")}
        >
          <input
            id="cadence_days"
            type="number"
            min={0}
            step={1}
            className="neo-input"
            value={cadenceDays}
            onChange={(e) => setCadenceDays(e.target.value)}
            placeholder="0"
          />
        </Field>

        <Field label={t("person.fields.how_we_met")} htmlFor="how_we_met">
          <textarea
            id="how_we_met"
            rows={3}
            className="neo-input"
            value={howWeMet}
            onChange={(e) => setHowWeMet(e.target.value)}
          />
        </Field>
      </section>

      {/* ===== Tags ===== */}
      <section className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">
          {t("person.form.section_tags")}
        </h2>

        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
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
          {availableTags.length === 0 && (
            <p className="text-xs text-fg-muted">
              {t("tag.empty")}. {t("common.optional")}
            </p>
          )}
        </div>

        <div className="flex items-end gap-2">
          <Field label={t("person.form.tag_create_placeholder")} htmlFor="tag_new" className="flex-1">
            <input
              id="tag_new"
              type="text"
              className="neo-input"
              value={tagToCreate}
              onChange={(e) => setTagToCreate(e.target.value)}
              placeholder={t("person.form.tag_create_placeholder")}
            />
          </Field>
          <button
            type="button"
            className="neo-btn"
            onClick={handleCreateTag}
            disabled={!tagToCreate.trim() || busy}
          >
            {t("person.form.tag_create_action")}
          </button>
        </div>
      </section>

      {/* ===== Contacts ===== */}
      <section className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">
          {t("person.form.section_contacts")}
        </h2>
        <div className="space-y-2">
          {contacts.map((c, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_2fr_1fr_auto]"
            >
              <select
                className="neo-input"
                value={c.type}
                onChange={(e) => setContactField(idx, "type", e.target.value)}
                aria-label={t("contact_info.type")}
              >
                {CONTACT_TYPE_SUGGESTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {t(`enums.contact.types.${s.key}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="neo-input"
                value={c.value}
                placeholder={t("contact_info.value")}
                onChange={(e) => setContactField(idx, "value", e.target.value)}
                aria-label={t("contact_info.value")}
              />
              <input
                type="text"
                className="neo-input"
                value={c.label}
                placeholder={t("contact_info.label")}
                onChange={(e) => setContactField(idx, "label", e.target.value)}
                aria-label={t("contact_info.label")}
              />
              <button
                type="button"
                onClick={() => removeContactRow(idx)}
                className="btn-icon btn-icon-danger"
                aria-label={t("common.delete")}
                title={t("common.delete")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addContactRow} className="neo-btn neo-btn-sm">
          <Plus className="size-4" aria-hidden="true" />
          {t("common.add")}
        </button>
      </section>

      {/* ===== Submit ===== */}
      {error && (
        <div role="alert" className="rounded-lg bg-status-overdue px-4 py-3 text-sm font-medium text-status-overdue-fg">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => (window.location.href = "/persons/")}
          className="neo-btn"
          disabled={busy}
        >
          {t("common.cancel")}
        </button>
        <button type="submit" className="neo-btn neo-btn-primary" disabled={busy}>
          {busy ? `${t("common.save")}...` : t("common.save")}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

export default withLang(PersonCreateForm);
