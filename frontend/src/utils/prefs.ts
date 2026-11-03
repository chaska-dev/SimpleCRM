/**
 * Interface preferences in the browser (language, theme, accent).
 *
 * Source of truth: backend (User.preferred_*). Mirror: cookies with the same
 * name, which SSR reads. Here the cookies are written, the change is applied
 * live (theme/accent) and saved in the backend with `PATCH /api/auth/me/`.
 * localStorage is no longer a source; it is only read once to migrate old values.
 */

import { apiFetch } from "../lib/api";
import { LANG_COOKIE } from "../i18n";
import {
  STORAGE_KEY_ACCENT,
  STORAGE_KEY_THEME,
  applyAccent,
  applyTheme,
  isValidHex,
  type ThemeId,
} from "../styles/themes";
import type { Lang, User } from "../types";

export const THEME_COOKIE = "preferred_theme";
export const ACCENT_COOKIE = "preferred_accent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
/** Old language key in localStorage (only for migrating). */
const LEGACY_LANG_KEY = "preferred_lang";

/** Writes a preference cookie (path `/`, SameSite=Lax, 1 year, readable by JS). */
export function writePrefCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

/** Applies the theme live (attribute on `<html>`) and keeps the cookie up to date. */
export function applyThemePref(theme: ThemeId): void {
  applyTheme(theme);
  writePrefCookie(THEME_COOKIE, theme);
}

/** Applies the accent live (variables on `<html>`) and keeps the cookie up to date. */
export function applyAccentPref(hex: string): void {
  if (!isValidHex(hex)) return;
  const value = hex.toLowerCase();
  applyAccent(value);
  writePrefCookie(ACCENT_COOKIE, value);
}

export interface PrefsPatch {
  preferred_lang?: Lang;
  preferred_theme?: ThemeId;
  preferred_accent?: string;
  onboarding_completed?: boolean;
}

/** Saves preferences in the backend (the backend responds with up-to-date cookies). */
export async function savePrefs(patch: PrefsPatch): Promise<User> {
  return apiFetch<User>("/api/auth/me/", { method: "PATCH", body: patch });
}

/**
 * Changes the app language: cookie + backend + reload (changes all of SSR,
 * so the reload is acceptable here). If the backend fails, it reloads anyway with
 * the new cookie.
 */
export async function changeLanguage(next: Lang): Promise<void> {
  writePrefCookie(LANG_COOKIE, next);
  try {
    await savePrefs({ preferred_lang: next });
  } catch {
    /* the cookie already changed; the backend aligns on the next save */
  }
  window.location.reload();
}

/** Changes the language without a session (login/register): cookie only + reload. */
export function changeLanguageAnonymous(next: Lang): void {
  writePrefCookie(LANG_COOKIE, next);
  window.location.reload();
}

/**
 * Migrates once the values that used to live in localStorage: if they exist
 * and differ from what the user has, it uploads them to the backend; then it deletes the
 * keys. Returns true if the language changed (the caller must reload).
 */
export async function migrateLegacyPrefs(current: {
  lang: Lang;
  theme: ThemeId;
  accent: string;
}): Promise<boolean> {
  let legacyLang: string | null = null;
  let legacyTheme: string | null = null;
  let legacyAccent: string | null = null;
  try {
    legacyLang = window.localStorage.getItem(LEGACY_LANG_KEY);
    legacyTheme = window.localStorage.getItem(STORAGE_KEY_THEME);
    legacyAccent = window.localStorage.getItem(STORAGE_KEY_ACCENT);
  } catch {
    return false;
  }
  if (legacyLang === null && legacyTheme === null && legacyAccent === null) return false;

  const clearLegacy = () => {
    try {
      window.localStorage.removeItem(LEGACY_LANG_KEY);
      window.localStorage.removeItem(STORAGE_KEY_THEME);
      window.localStorage.removeItem(STORAGE_KEY_ACCENT);
    } catch {
      /* no access to localStorage: nothing to clean up */
    }
  };

  const patch: PrefsPatch = {};
  if ((legacyLang === "en" || legacyLang === "es") && legacyLang !== current.lang) {
    patch.preferred_lang = legacyLang;
  }
  if ((legacyTheme === "dark" || legacyTheme === "light") && legacyTheme !== current.theme) {
    patch.preferred_theme = legacyTheme;
  }
  if (legacyAccent && isValidHex(legacyAccent) && legacyAccent.toLowerCase() !== current.accent) {
    patch.preferred_accent = legacyAccent.toLowerCase();
  }
  if (Object.keys(patch).length === 0) {
    clearLegacy();
    return false;
  }

  try {
    const saved = await savePrefs(patch);
    // A backend without the new fields would ignore them: in that case nothing is
    // deleted so the user's choice is not lost.
    if (typeof saved?.preferred_theme !== "string") return false;
  } catch {
    return false;
  }
  clearLegacy();
  if (patch.preferred_theme) applyThemePref(patch.preferred_theme);
  if (patch.preferred_accent) applyAccentPref(patch.preferred_accent);
  if (patch.preferred_lang) writePrefCookie(LANG_COOKIE, patch.preferred_lang);
  return Boolean(patch.preferred_lang);
}
