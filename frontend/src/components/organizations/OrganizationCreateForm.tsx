/**
 * OrganizationCreateForm — /organizations/new/ page.
 * Creates the organization (JSON) and, if a logo was chosen, uploads it separately.
 */
import { useState } from "react";
import type { Lang, Tag } from "../../types";
import { useTranslation, withLang } from "../../i18n";
import { ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import OrganizationForm, { type OrganizationFormValues } from "./OrganizationForm";
import { saveOrganization } from "./saveOrganization";

interface Props {
  lang?: Lang;
  existingTags: Tag[];
}

const FORM_ID = "organization-create-form";

function OrganizationCreateForm({ existingTags }: Props) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>(existingTags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: OrganizationFormValues) => {
    setBusy(true);
    setError(null);
    try {
      const { organization, logoError } = await saveOrganization(values, null);
      if (logoError) toast.warning(`${t("organization.logo.upload_failed")}: ${logoError}`);
      toast.success(t("organization.created"));
      window.location.href = `/organizations/${organization.id}/`;
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">{t("organization.form.new_title")}</h1>

      <div className="neo-card p-5">
        <OrganizationForm
          formId={FORM_ID}
          tags={tags}
          onTagCreated={(tag) => setTags((cur) => [...cur, tag])}
          onSubmit={handleSubmit}
          error={error}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <a href="/organizations/" className="neo-btn no-underline">
          {t("common.cancel")}
        </a>
        <button type="submit" form={FORM_ID} disabled={busy} className="neo-btn neo-btn-primary">
          {busy ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

export default withLang(OrganizationCreateForm);
