/**
 * Theme registry — runtime source of truth.
 * Tokens are injected as CSS vars in `src/styles/global.css`.
 * Structure mirrors `docs/design/themes.md`.
 *
 * Preferences live in the backend (User.preferred_theme / preferred_accent)
 * and are mirrored in cookies of the same name for SSR. localStorage is no longer a
 * source: the `STORAGE_KEY_*` keys only serve to migrate old values.
 *
 * If you add a new theme: add a block in `global.css` and the id here.
 */

export type ThemeId = "light" | "dark";

export const THEME_IDS: readonly ThemeId[] = ["dark", "light"];

export const DEFAULT_THEME: ThemeId = "dark";

/** Old localStorage keys (only for migrating). */
export const STORAGE_KEY_THEME = "preferred_theme";

/** Applies the theme to <html>. Call before the first paint to avoid FOUC. */
export function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

/** Current theme: what the server left in `<html data-theme>`. */
export function readAppliedTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/* === Customizable accent === */

/** The visible name comes from i18n: `settings.accent.preset.<id>`. */
export interface AccentPreset {
  id: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "pink", hex: "#db2777" },
  { id: "rose", hex: "#e11d48" },
  { id: "violet", hex: "#7c3aed" },
  { id: "blue", hex: "#2563eb" },
  { id: "teal", hex: "#0d9488" },
  { id: "green", hex: "#16a34a" },
  { id: "orange", hex: "#ea580c" },
  { id: "slate", hex: "#475569" },
];

export const DEFAULT_ACCENT = "#db2777";

/** Old localStorage key (only for migrating). */
export const STORAGE_KEY_ACCENT = "preferred_accent";

/** Accepts only `#rrggbb`. */
export function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function relativeLuminance(hex: string): number {
  const chan = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
}

/** Returns `#ffffff` or `#18181b`: the one with the higher WCAG ratio against `hex`. */
export function accentForeground(hex: string): string {
  const l = relativeLuminance(hex);
  const ratioWhite = 1.05 / (l + 0.05);
  const ratioDark = (l + 0.05) / (relativeLuminance("#18181b") + 0.05);
  return ratioWhite >= ratioDark ? "#ffffff" : "#18181b";
}

/** Sets `--accent-base` and `--accent-fg` on <html>. */
export function applyAccent(hex: string): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  style.setProperty("--accent-base", hex);
  style.setProperty("--accent-fg", accentForeground(hex));
}

/** Current accent: the one the server left inline on `<html>`. */
export function readAppliedAccent(): string {
  if (typeof document === "undefined") return DEFAULT_ACCENT;
  const v = document.documentElement.style.getPropertyValue("--accent-base").trim();
  return isValidHex(v) ? v.toLowerCase() : DEFAULT_ACCENT;
}
