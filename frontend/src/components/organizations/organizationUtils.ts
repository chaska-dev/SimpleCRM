/**
 * Shared Organization helpers (list, detail, form and person record).
 */
import type { Organization, OrganizationKind } from "../../types";
import { getMediaUrl } from "../../lib/media";

export const ORGANIZATION_KINDS: OrganizationKind[] = [
  "university",
  "school",
  "company",
  "government",
  "health",
  "community",
  "other",
];

/** Backend limit for the original logo file (1 MB). Validation is done by useImagePicker. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/**
 * Logo URL ready for <img>. The backend may return an absolute URL
 * (with the internal host): only the /media/... path is used to go through the
 * same origin. `updated_at` busts the cache on replacement (the file
 * name is stable).
 */
export function orgLogoUrl(org: Pick<Organization, "logo" | "updated_at">): string {
  if (!org.logo) return "";
  let path = org.logo;
  if (/^https?:/i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* used as is */
    }
  }
  const url = getMediaUrl(path);
  return org.updated_at ? `${url}?v=${encodeURIComponent(org.updated_at)}` : url;
}

/** Full readable address: "Av. X 123, Santiago, Chile". */
export function fullAddress(org: Pick<Organization, "address" | "city" | "country">): string {
  return [org.address, org.city, org.country].filter(Boolean).join(", ");
}

/** Google Maps search link for an address. */
export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
