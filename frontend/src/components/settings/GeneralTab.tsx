/**
 * GeneralTab — language / theme / timezone / sidebar branding.
 *
 * - Lang: PATCH `/api/auth/me/` `preferred_lang` + cookie + reload (changes
 *   all the server HTML, so the reload is acceptable only here).
 * - Theme: applied instantly (no reload) and saved in the backend
 *   (`preferred_theme`) + cookie for SSR.
 * - Accent: presets + custom color. Applied instantly and saved in the
 *   backend (`preferred_accent`) + cookie.
 * - Timezone: only persisted in localStorage (stub, no endpoint).
 * - Branding (first section): PATCH `/api/auth/me/` with `sidebar_name` (text)
 *   and/or `sidebar_icon` (multipart: original file + crop_x/y/w/h of the crop done
 *   in ImageCropModal via useImagePicker). Live preview before saving. On
 *   save it does NOT reload: it dispatches `crm:branding-updated` and SideNav (sidebar,
 *   mobile brand and <title>) updates in the DOM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  accentForeground,
  isValidHex,
  type ThemeId,
} from "../../styles/themes";
import { applyAccentPref, applyThemePref, changeLanguage, savePrefs } from "../../utils/prefs";
import { apiFetch } from "../../lib/api";
import { getMediaUrl } from "../../lib/media";
import { toast } from "../../lib/toaster";
import Logo from "../ui/Logo";
import { CropPreview } from "../ui/ImageCropModal";
import { appendCrop, useImagePicker, type PickResult } from "../ui/ImagePicker";
import { useImageFade } from "../ui/useImageFade";
import type { Lang, User } from "../../types";

interface Props {
  lang: Lang;
  user: User;
}

const ICON_MAX_BYTES = 500 * 1024;

/** Icon saved in the branding preview: fades in over 200 ms. */
function SavedBrandIcon({ src }: { src: string }) {
  const { imgProps } = useImageFade(src);
  return (
    <img
      {...imgProps}
      src={src}
      alt=""
      className={`${imgProps.className} size-8 shrink-0 rounded-md bg-surface object-cover`}
    />
  );
}
/** Tells the shell (SideNav) that the branding changed, without reloading the page. */
function broadcastBranding(name: string, iconUrl: string | null): void {
  window.dispatchEvent(
    new CustomEvent("crm:branding-updated", { detail: { name, iconUrl } }),
  );
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (_) {
    return "";
  }
}

export default function GeneralTab({ lang, user }: Props) {
  const { t } = useTranslation();

  // Controlled state. Initialized from the (server-rendered) user: SSR and hydration match.
  const [selectedLang, setSelectedLang] = useState<Lang>(lang === "en" ? "en" : "es");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(
    user.preferred_theme === "light" ? "light" : "dark",
  );
  const [accent, setAccent] = useState<string>(
    user.preferred_accent && isValidHex(user.preferred_accent)
      ? user.preferred_accent.toLowerCase()
      : DEFAULT_ACCENT,
  );
  const accentSaveTimer = useRef<number | null>(null);
  // Last value confirmed by the backend: revert to it if the PATCH fails.
  const savedTheme = useRef<ThemeId>(user.preferred_theme === "light" ? "light" : "dark");
  const savedAccent = useRef<string>(
    user.preferred_accent && isValidHex(user.preferred_accent)
      ? user.preferred_accent.toLowerCase()
      : DEFAULT_ACCENT,
  );
  // Timezone: lives in localStorage (client only); read on mount so
  // the server HTML and hydration match.
  const [timezone, setTimezone] = useState<string>("");
  useEffect(() => {
    try {
      setTimezone(window.localStorage.getItem("preferred_timezone") ?? detectTimezone());
    } catch (_) {
      setTimezone(detectTimezone());
    }
  }, []);

  // Sidebar branding — initialize from the user that came server-rendered.
  const [sidebarName, setSidebarName] = useState<string>(user.sidebar_name ?? "");
  const [sidebarIconUrl, setSidebarIconUrl] = useState<string | null>(
    getMediaUrl(user.sidebar_icon) || null,
  );
  // Value currently on the server (to know if there are unsaved changes).
  const [savedName, setSavedName] = useState<string>((user.sidebar_name ?? "").trim());
  const [pendingIconFile, setPendingIconFile] = useState<PickResult | null>(null);
  const [pendingIconPreview, setPendingIconPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState<
    null | "lang" | "theme" | "tz" | "brand"
  >(null);

  // Release the object URL when the preview changes.
  useEffect(() => {
    return () => {
      if (pendingIconPreview) URL.revokeObjectURL(pendingIconPreview);
    };
  }, [pendingIconPreview]);

  const saveLang = useCallback(async () => {
    setSaving("lang");
    // Cookie + backend + reload: the server HTML changes language.
    await changeLanguage(selectedLang);
  }, [selectedLang]);

  const changeTheme = useCallback(
    async (next: ThemeId) => {
      setSelectedTheme(next);
      applyThemePref(next);
      setSaving("theme");
      try {
        await savePrefs({ preferred_theme: next });
        savedTheme.current = next;
        toast.success(t("settings.general.saved_theme"));
      } catch (err) {
        // No backend confirmation: restore the previous theme (UI, cookie and state).
        const previous = savedTheme.current;
        applyThemePref(previous);
        setSelectedTheme(previous);
        toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  const changeAccent = useCallback(
    (hex: string, notifyNow: boolean) => {
      if (!isValidHex(hex)) return;
      const value = hex.toLowerCase();
      applyAccentPref(value);
      setAccent(value);
      // The color picker emits many events while dragging: it is
      // saved to the backend once it settles (or immediately for presets).
      if (accentSaveTimer.current !== null) window.clearTimeout(accentSaveTimer.current);
      const persist = async () => {
        accentSaveTimer.current = null;
        try {
          await savePrefs({ preferred_accent: value });
          savedAccent.current = value;
          if (notifyNow) toast.success(t("settings.accent.saved"));
        } catch (err) {
          // No backend confirmation: restore the previous accent (UI, cookie and state).
          const previous = savedAccent.current;
          applyAccentPref(previous);
          setAccent(previous);
          toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
        }
      };
      if (notifyNow) void persist();
      else accentSaveTimer.current = window.setTimeout(() => void persist(), 600);
    },
    [t],
  );

  const saveTimezone = useCallback(() => {
    setSaving("tz");
    try {
      const trimmed = timezone.trim();
      if (trimmed) {
        window.localStorage.setItem("preferred_timezone", trimmed);
      } else {
        window.localStorage.removeItem("preferred_timezone");
      }
      toast.success(t("settings.defaults.saved"));
    } catch (_) {
      toast.error(t("messages.error_generic"));
    } finally {
      setSaving(null);
    }
  }, [timezone, t]);

  const picker = useImagePicker({
    variant: "sidebar",
    maxBytes: ICON_MAX_BYTES,
    onConfirm: ({ file, crop, width, height }) => {
      // The original file and the crop are uploaded when branding Save is pressed.
      if (pendingIconPreview) URL.revokeObjectURL(pendingIconPreview);
      setPendingIconFile({ file, crop, width, height });
      setPendingIconPreview(URL.createObjectURL(file));
    },
  });

  const clearPickedIcon = useCallback(() => {
    if (pendingIconPreview) URL.revokeObjectURL(pendingIconPreview);
    setPendingIconFile(null);
    setPendingIconPreview(null);
  }, [pendingIconPreview]);

  const saveBrand = useCallback(async () => {
    setSaving("brand");
    const trimmedName = sidebarName.trim().slice(0, 60);

    try {
      // If there is a new file → multipart. Otherwise send only the name as
      // JSON so as not to break the serializer (JSON-only endpoints).
      const savedUser = pendingIconFile
        ? await apiFetch<User>("/api/auth/me/", {
            method: "PATCH",
            body: (() => {
              const fd = new FormData();
              fd.append("sidebar_name", trimmedName);
              fd.append("sidebar_icon", pendingIconFile.file);
              appendCrop(fd, pendingIconFile.crop);
              return fd;
            })(),
          })
        : await apiFetch<User>("/api/auth/me/", {
            method: "PATCH",
            body: { sidebar_name: trimmedName },
          });

      // Reflect the change with the final server URL. The file is
      // replaced with the same name, so we add ?v= to bust the cache.
      const nextName = (savedUser?.sidebar_name ?? trimmedName).trim();
      const serverIcon = getMediaUrl(savedUser?.sidebar_icon) || null;
      const nextIcon = serverIcon ? `${serverIcon}?v=${Date.now()}` : null;
      setSavedName(nextName);
      setSidebarName(nextName);
      setSidebarIconUrl(nextIcon);
      clearPickedIcon();
      broadcastBranding(nextName, nextIcon);
      toast.success(t("settings.general.saved_brand"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    } finally {
      setSaving(null);
    }
  }, [sidebarName, pendingIconFile, clearPickedIcon, t]);

  const removeIcon = useCallback(async () => {
    // A chosen but unsaved icon is simply discarded (reverts to the saved one).
    if (pendingIconFile) {
      clearPickedIcon();
      return;
    }
    setSaving("brand");
    try {
      await apiFetch<User>("/api/auth/me/", {
        method: "PATCH",
        body: { sidebar_icon: null },
      });
      setSidebarIconUrl(null);
      clearPickedIcon();
      // Only the icon changes on the server: the unsaved name is kept
      // in the form, and the sidebar shows the already-saved name.
      broadcastBranding(savedName, null);
      toast.success(t("settings.general.saved_brand"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    } finally {
      setSaving(null);
    }
  }, [pendingIconFile, clearPickedIcon, savedName, t]);

  const resetName = useCallback(() => {
    setSidebarName("");
  }, []);

  const detectedTz = detectTimezone();
  const previewSrc = pendingIconPreview ?? sidebarIconUrl;
  const brandDirty =
    sidebarName.trim() !== savedName || pendingIconFile !== null;

  return (
    <div className="divide-y divide-border">
      {/* App branding: first section. Live preview of the sidebar header. */}
      <section className="py-5 first:pt-0">
        <h2 className="text-sm font-semibold">{t("settings.general.section_brand")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.general.brand_help")}</p>

        {/* Preview: mini sidebar header, updates before saving. */}
        <div className="mt-4 max-w-sm">
          <p className="mb-1.5 text-xs font-medium text-fg-muted">
            {t("settings.general.brand_preview")}
          </p>
          <div
            className="flex h-14 items-center gap-3 rounded-md border border-border bg-surface px-3"
            aria-live="polite"
          >
            {pendingIconFile && pendingIconPreview ? (
              <CropPreview
                src={pendingIconPreview}
                width={pendingIconFile.width}
                height={pendingIconFile.height}
                crop={pendingIconFile.crop}
                size={32}
              />
            ) : previewSrc ? (
              <SavedBrandIcon src={previewSrc} />
            ) : (
              <Logo size={24} />
            )}
            <span className="min-w-0 truncate text-sm font-semibold">
              {sidebarName.trim() || t("shell.app_name")}
            </span>
          </div>
        </div>

        <div className="mt-4 max-w-sm space-y-4">
          {/* Name — with inline "X" to clear. */}
          <div>
            <label htmlFor="settings-brand-name" className="mb-1.5 block text-sm font-medium">
              {t("settings.general.brand_field_name")}
            </label>
            <div className="relative">
              <input
                id="settings-brand-name"
                type="text"
                className="neo-input pr-10"
                placeholder={t("shell.app_name")}
                value={sidebarName}
                onChange={(e) => setSidebarName(e.target.value)}
                disabled={saving === "brand"}
                maxLength={60}
                autoComplete="off"
              />
              {sidebarName && (
                <button
                  type="button"
                  className="btn-icon absolute right-0.5 top-0.5"
                  onClick={resetName}
                  disabled={saving === "brand"}
                  title={t("settings.general.brand_reset_title")}
                  aria-label={t("settings.general.brand_reset_title")}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Icon */}
          <div>
            <span id="settings-brand-icon-label" className="mb-1.5 block text-sm font-medium">
              {t("settings.general.brand_field_icon")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="neo-btn neo-btn-sm"
                onClick={picker.open}
                disabled={saving === "brand"}
                aria-describedby="settings-brand-icon-meta"
              >
                <Upload className="size-4" aria-hidden="true" />
                {t("settings.general.brand_choose_icon")}
              </button>
              {(pendingIconPreview || sidebarIconUrl) && (
                <button
                  type="button"
                  className="neo-btn neo-btn-sm neo-btn-ghost"
                  onClick={removeIcon}
                  disabled={saving === "brand"}
                >
                  {t("settings.general.brand_remove_icon")}
                </button>
              )}
              <span
                id="settings-brand-icon-meta"
                className="min-w-0 truncate text-xs text-fg-muted"
                title={pendingIconFile?.file.name}
              >
                {pendingIconFile
                  ? `${pendingIconFile.file.name} · ${Math.max(1, Math.round(pendingIconFile.file.size / 1024))} KB`
                  : sidebarIconUrl
                    ? t("settings.general.brand_icon_current")
                    : t("settings.general.brand_no_icon")}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">{t("settings.general.brand_icon_help")}</p>
            {picker.error && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-accent">
                {picker.error}
              </p>
            )}
            {picker.input}
            {picker.modal}
          </div>
        </div>

        {/* A single Save at the end. */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={saveBrand}
            disabled={saving === "brand" || !brandDirty}
          >
            {saving === "brand" ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </section>

      {/* Language */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.general.section_language")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.general.language_help")}</p>
        <div className="mt-4 max-w-sm">
          <label htmlFor="settings-lang" className="mb-1.5 block text-sm font-medium">
            {t("settings.general.field_language")}
          </label>
          <select
            id="settings-lang"
            className="neo-input"
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value === "en" ? "en" : "es")}
            disabled={saving === "lang"}
          >
            <option value="es">{t("lang.es")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={saveLang}
            disabled={saving === "lang" || selectedLang === lang}
          >
            {saving === "lang" ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </section>

      {/* Theme */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.general.section_theme")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.general.theme_help")}</p>
        <div className="mt-4 max-w-sm">
          <label htmlFor="settings-theme" className="mb-1.5 block text-sm font-medium">
            {t("settings.general.field_theme")}
          </label>
          <select
            id="settings-theme"
            className="neo-input"
            value={selectedTheme}
            onChange={(e) => void changeTheme(e.target.value === "light" ? "light" : "dark")}
            disabled={saving === "theme"}
          >
            <option value="light">{t("theme.light")}</option>
            <option value="dark">{t("theme.dark")}</option>
          </select>
        </div>
      </section>

      {/* Accent */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.accent.section_title")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.accent.help")}</p>
        <div
          role="group"
          aria-label={t("settings.accent.presets_label")}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {ACCENT_PRESETS.map((preset) => {
            const active = accent.toLowerCase() === preset.hex.toLowerCase();
            const name = t(`settings.accent.preset.${preset.id}`);
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={name}
                aria-pressed={active}
                title={name}
                onClick={() => changeAccent(preset.hex, true)}
                className={[
                  "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform duration-fast hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "ring-2 ring-fg" : "",
                ].join(" ")}
                style={{ backgroundColor: preset.hex, color: accentForeground(preset.hex) }}
              >
                {active && <Check className="size-4" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="settings-accent-custom">
            {t("settings.accent.custom_label")}
            <input
              id="settings-accent-custom"
              type="color"
              value={isValidHex(accent) ? accent : DEFAULT_ACCENT}
              onChange={(e) => changeAccent(e.target.value, false)}
              className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <span className="text-xs text-fg-muted tabular-nums">{accent}</span>
          <button
            type="button"
            className="neo-btn neo-btn-sm ml-auto"
            onClick={() => changeAccent(DEFAULT_ACCENT, true)}
            disabled={accent.toLowerCase() === DEFAULT_ACCENT}
          >
            {t("settings.accent.reset")}
          </button>
        </div>
      </section>

      {/* Timezone */}
      <section className="py-5 last:pb-0">
        <h2 className="text-sm font-semibold">{t("settings.general.section_timezone")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.general.timezone_help")}</p>
        <div className="mt-4 max-w-sm">
          <label htmlFor="settings-tz" className="mb-1.5 block text-sm font-medium">
            {t("settings.general.field_timezone")}
          </label>
          <input
            id="settings-tz"
            type="text"
            className="neo-input"
            placeholder="America/Santiago"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={saving === "tz"}
            autoComplete="off"
            spellCheck={false}
          />
          {detectedTz && (
            <p className="mt-1.5 text-xs text-fg-muted">
              {t("settings.general.timezone_detected", { tz: detectedTz })}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={saveTimezone}
            disabled={saving === "tz"}
          >
            {saving === "tz" ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </section>
    </div>
  );
}
