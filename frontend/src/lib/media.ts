/**
 * Helper to build URLs to backend MEDIA files.
 *
 * Accepts any reasonable form the backend returns:
 * - Absolute URL (`http://...`, `https://...`)
 * - Data-URL or blob-URL (`data:...`, `blob:...`)
 * - Path with `/media/` already included (`/media/sidebar_icons/user_X.png`)
 * - Path relative to MEDIA_ROOT (`sidebar_icons/user_X.png`)
 *
 * If PUBLIC_API_URL is set (e.g. cross-origin prod), prefix with it.
 * Otherwise, return the path as-is — the vite dev proxy in astro.config.mjs
 * already forwards `/media/*` to the backend.
 */

const API_BASE =
  (import.meta as unknown as { env: { PUBLIC_API_URL?: string } }).env.PUBLIC_API_URL ?? "";

export function getMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;

  const base = API_BASE.replace(/\/$/, "");
  const cleanPath = path.replace(/^\//, "");

  // If the backend already returned "/media/...", respect it and only prefix with
  // the backend base. Otherwise, add "/media/" ourselves.
  if (cleanPath.startsWith("media/")) {
    return base ? `${base}/${cleanPath}` : `/${cleanPath}`;
  }
  return base ? `${base}/media/${cleanPath}` : `/media/${cleanPath}`;
}