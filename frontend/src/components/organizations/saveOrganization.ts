/**
 * Saving an organization from OrganizationFormValues.
 *
 * Fields go as JSON (allows clearing tags) and the logo via a separate multipart
 * PATCH (original file + crop_x/y/w/h; the backend crops and downsizes);
 * removing the logo is `PATCH {logo: null}`.
 */
import type { Organization } from "../../types";
import { apiFetch } from "../../lib/api";
import { appendCrop } from "../ui/ImagePicker";
import type { OrganizationFormValues } from "./OrganizationForm";

export interface SaveResult {
  organization: Organization;
  /** Message if the fields were saved but the logo failed. */
  logoError: string | null;
}

export async function saveOrganization(
  values: OrganizationFormValues,
  existing: Organization | null,
): Promise<SaveResult> {
  let org = existing
    ? await apiFetch<Organization>(`/api/organizations/${existing.id}/`, {
        method: "PATCH",
        body: values.fields,
      })
    : await apiFetch<Organization>("/api/organizations/", {
        method: "POST",
        body: values.fields,
      });

  let logoError: string | null = null;
  try {
    if (values.logoFile) {
      const fd = new FormData();
      fd.append("logo", values.logoFile);
      if (values.logoCrop) appendCrop(fd, values.logoCrop);
      org = await apiFetch<Organization>(`/api/organizations/${org.id}/`, {
        method: "PATCH",
        body: fd,
      });
    } else if (values.removeLogo && existing?.logo) {
      org = await apiFetch<Organization>(`/api/organizations/${org.id}/`, {
        method: "PATCH",
        body: { logo: null },
      });
    }
  } catch (err) {
    logoError = err instanceof Error ? err.message : String(err);
  }
  return { organization: org, logoError };
}
