import { useState, useEffect } from "react";
import Modal from "./Modal";
import { apiFetch, ApiError } from "../../../lib/api";
import type { Person } from "../../../types";
import { useTranslation } from "../../../i18n";

interface Props {
  open: boolean;
  person: Person;
  onClose: () => void;
  onSaved: (next: Person) => void;
}

/**
 * EditPersonModal — inline form to edit first_name, last_name, nick_name,
 * company, role, how_we_met, favorite, cadence_days.
 * PATCH `/api/persons/{id}/` with the partial payload.
 */
export default function EditPersonModal({ open, person, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    first_name: person.first_name,
    last_name: person.last_name,
    nick_name: person.nick_name,
    company: person.company,
    role: person.role,
    how_we_met: person.how_we_met,
    favorite: person.favorite,
    cadence_days: person.cadence_days === null ? "" : String(person.cadence_days),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync draft when the underlying person changes.
  useEffect(() => {
    if (!open) return;
    setDraft({
      first_name: person.first_name,
      last_name: person.last_name,
      nick_name: person.nick_name,
      company: person.company,
      role: person.role,
      how_we_met: person.how_we_met,
      favorite: person.favorite,
      cadence_days: person.cadence_days === null ? "" : String(person.cadence_days),
    });
    setError(null);
  }, [open, person]);

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft((cur) => ({ ...cur, [k]: v }));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const cadenceNum = draft.cadence_days === "" ? null : Number(draft.cadence_days);
      const payload: Partial<Person> & { cadence_days: number | null } = {
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        nick_name: draft.nick_name.trim(),
        company: draft.company.trim(),
        role: draft.role.trim(),
        how_we_met: draft.how_we_met,
        favorite: draft.favorite,
        cadence_days: cadenceNum === null || Number.isNaN(cadenceNum) ? null : cadenceNum,
      };
      const updated = await apiFetch<Person>(`/api/persons/${person.id}/`, {
        method: "PATCH",
        body: payload,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setError(e.detail || e.message);
      else setError(t("messages.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("person.edit.title")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-primary"
            onClick={handleSave}
            disabled={busy || !draft.first_name.trim()}
          >
            {busy ? t("common.saving") : t("person.edit.save")}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("person.fields.first_name")} required>
          <input
            className="neo-input"
            value={draft.first_name}
            onChange={(e) => update("first_name", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.last_name")}>
          <input
            className="neo-input"
            value={draft.last_name}
            onChange={(e) => update("last_name", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.nick_name")}>
          <input
            className="neo-input"
            value={draft.nick_name}
            onChange={(e) => update("nick_name", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.company")}>
          <input
            className="neo-input"
            value={draft.company}
            onChange={(e) => update("company", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.role")}>
          <input
            className="neo-input"
            value={draft.role}
            onChange={(e) => update("role", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.cadence_days")}>
          <input
            className="neo-input"
            type="number"
            min={0}
            inputMode="numeric"
            value={draft.cadence_days}
            onChange={(e) => update("cadence_days", e.target.value)}
          />
        </Field>
        <Field label={t("person.fields.favorite")}>
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.favorite}
              onChange={(e) => update("favorite", e.target.checked)}
            />
            <span className="text-sm">{t(draft.favorite ? "person.remove_from_favorites" : "person.add_to_favorites")}</span>
          </label>
        </Field>
      </div>
      <div className="mt-4">
        <Field label={t("person.fields.how_we_met")}>
          <textarea
            className="neo-input min-h-24"
            value={draft.how_we_met}
            onChange={(e) => update("how_we_met", e.target.value)}
          />
        </Field>
      </div>
      {error && (
        <p className="mt-4 rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg">
          {error}
        </p>
      )}
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}