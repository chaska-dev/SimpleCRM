/**
 * EditOrganizationModal — edit an organization from the detail page.
 * Loads tags on open (for the form's selector).
 */
import { useEffect, useState } from "react";
import type { Organization, Tag } from "../../types";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import Modal from "../persons/detail/Modal";
import { LoadingSwap, FormFieldsSkeleton } from "../ui";
import OrganizationForm, { type OrganizationFormValues } from "./OrganizationForm";
import { saveOrganization } from "./saveOrganization";

interface Props {
  open: boolean;
  organization: Organization;
  onClose: () => void;
  onSaved: (org: Organization) => void;
}

const FORM_ID = "organization-edit-form";

export default function EditOrganizationModal({ open, organization, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    let cancelled = false;
    apiFetch<Tag[]>("/api/tags/")
      .then((data) => {
        if (!cancelled) setTags(data);
      })
      .catch(() => {
        if (cancelled) return;
        setTags([]);
        toast.error(t("organization.errors.tags_load_failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const handleSubmit = async (values: OrganizationFormValues) => {
    setBusy(true);
    setError(null);
    try {
      const { organization: saved, logoError } = await saveOrganization(values, organization);
      if (logoError) toast.warning(`${t("organization.logo.upload_failed")}: ${logoError}`);
      toast.success(t("organization.saved"));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("messages.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("organization.edit")}
      size="lg"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className="neo-btn neo-btn-primary"
            disabled={busy || tags === null}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <LoadingSwap
        loading={tags === null}
        label={t("common.loading")}
        skeleton={<FormFieldsSkeleton fields={5} />}
      >
        {tags !== null && (
          <OrganizationForm
            formId={FORM_ID}
            initial={organization}
            tags={tags}
            onTagCreated={(tag) => setTags((cur) => [...(cur ?? []), tag])}
            onSubmit={handleSubmit}
            error={error}
          />
        )}
      </LoadingSwap>
    </Modal>
  );
}
