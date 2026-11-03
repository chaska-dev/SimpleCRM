/**
 * WelcomeView — welcome screen (/welcome/), a single page with three steps:
 *   1. Language (ES / EN): changes the text instantly, without reloading.
 *   2. Theme (dark / light): cards with a preview drawn with the theme tokens.
 *   3. Accent color: presets + custom color. Applied live.
 *
 * "Get started" saves everything with a PATCH, writes the cookies and goes to /dashboard/.
 * "Skip" saves only `onboarding_completed=true` (default values).
 *
 * Accessibility: groups with `role="radiogroup"` and native radios (keyboard with
 * arrows, visible focus with `peer-focus-visible`).
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LANG_COOKIE, LangContext, t as translate, useTranslation } from "../../i18n";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  accentForeground,
  isValidHex,
  type ThemeId,
} from "../../styles/themes";
import { applyAccentPref, applyThemePref, savePrefs, writePrefCookie } from "../../utils/prefs";
import { toast } from "../../lib/toaster";
import Logo from "../ui/Logo";
import type { Lang } from "../../types";

interface Props {
  initialLang: Lang;
  initialTheme: ThemeId;
  initialAccent: string;
}

const LANGS: readonly Lang[] = ["es", "en"];
const THEMES_ORDER: readonly ThemeId[] = ["dark", "light"];

export default function WelcomeView({ initialLang, initialTheme, initialAccent }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang);
  return (
    <LangContext.Provider value={lang}>
      <WelcomeBody
        lang={lang}
        onLang={setLang}
        initialTheme={initialTheme}
        initialAccent={initialAccent}
      />
    </LangContext.Provider>
  );
}

interface BodyProps {
  lang: Lang;
  onLang: (l: Lang) => void;
  initialTheme: ThemeId;
  initialAccent: string;
}

function WelcomeBody({ lang, onLang, initialTheme, initialAccent }: BodyProps) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [accent, setAccent] = useState<string>(
    isValidHex(initialAccent) ? initialAccent.toLowerCase() : DEFAULT_ACCENT,
  );
  const [busy, setBusy] = useState<null | "start" | "skip">(null);

  // Language changes on the client only: <html lang> and <title> follow the state.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${translate(lang, "welcome.title")} · ${translate(lang, "shell.app_name")}`;
  }, [lang]);

  const pickTheme = (next: ThemeId) => {
    setTheme(next);
    // Only the live attribute: the cookie is written on save.
    document.documentElement.setAttribute("data-theme", next);
  };

  const pickAccent = (hex: string) => {
    if (!isValidHex(hex)) return;
    const value = hex.toLowerCase();
    setAccent(value);
    const style = document.documentElement.style;
    style.setProperty("--accent-base", value);
    style.setProperty("--accent-fg", accentForeground(value));
  };

  const finish = async (mode: "start" | "skip") => {
    setBusy(mode);
    try {
      if (mode === "start") {
        await savePrefs({
          preferred_lang: lang,
          preferred_theme: theme,
          preferred_accent: accent,
          onboarding_completed: true,
        });
        writePrefCookie(LANG_COOKIE, lang);
        applyThemePref(theme);
        applyAccentPref(accent);
      } else {
        // Skip: only marks the welcome as done; the rest stays at defaults.
        await savePrefs({ onboarding_completed: true });
      }
      window.location.href = "/dashboard/";
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    }
  };

  const isPreset = ACCENT_PRESETS.some((p) => p.hex === accent);

  return (
    <div className="neo-card w-full max-w-lg p-6">
      <div className="mb-4 flex justify-center">
        <Logo size={48} />
      </div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{t("welcome.title")}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t("welcome.subtitle")}</p>
      </header>

      <div className="divide-y divide-border">
        {/* Step 1: language */}
        <section className="pb-5" aria-labelledby="welcome-step-lang">
          <StepTitle n={1} id="welcome-step-lang" label={t("welcome.step_language")} />
          <div
            role="radiogroup"
            aria-labelledby="welcome-step-lang"
            className="mt-3 grid grid-cols-2 gap-2"
          >
            {LANGS.map((code) => (
              <label key={code} className="block cursor-pointer">
                <input
                  type="radio"
                  name="welcome-lang"
                  value={code}
                  checked={lang === code}
                  onChange={() => onLang(code)}
                  aria-labelledby={`welcome-lang-${code}`}
                  className="peer sr-only"
                />
                <span className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors duration-fast ease-standard hover:bg-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary-soft-fg peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <span className="font-semibold" aria-hidden="true">
                    {code.toUpperCase()}
                  </span>
                  <span id={`welcome-lang-${code}`} className="text-fg-muted">
                    {translate(code, `lang.${code}`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Step 2: theme */}
        <section className="py-5" aria-labelledby="welcome-step-theme">
          <StepTitle n={2} id="welcome-step-theme" label={t("welcome.step_theme")} />
          <div
            role="radiogroup"
            aria-labelledby="welcome-step-theme"
            className="mt-3 grid grid-cols-2 gap-3"
          >
            {THEMES_ORDER.map((id) => (
              <label key={id} className="block cursor-pointer">
                <input
                  type="radio"
                  name="welcome-theme"
                  value={id}
                  checked={theme === id}
                  onChange={() => pickTheme(id)}
                  aria-labelledby={`welcome-theme-${id}`}
                  className="peer sr-only"
                />
                <span className="block rounded-lg border border-border p-2 transition-colors duration-fast ease-standard hover:bg-muted peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <ThemePreview id={id} />
                  <span className="mt-2 flex items-center justify-between px-1 text-sm font-medium">
                    <span id={`welcome-theme-${id}`}>{t(`theme.${id}`)}</span>
                    {theme === id && <Check className="size-4 text-primary" aria-hidden="true" />}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Step 3: accent */}
        <section className="pt-5" aria-labelledby="welcome-step-accent">
          <StepTitle n={3} id="welcome-step-accent" label={t("welcome.step_accent")} />
          <div
            role="radiogroup"
            aria-labelledby="welcome-step-accent"
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            {ACCENT_PRESETS.map((preset) => {
              const active = accent === preset.hex;
              const name = t(`settings.accent.preset.${preset.id}`);
              return (
                <label key={preset.id} className="cursor-pointer" title={name}>
                  <input
                    type="radio"
                    name="welcome-accent"
                    value={preset.hex}
                    checked={active}
                    onChange={() => pickAccent(preset.hex)}
                    aria-label={name}
                    className="peer sr-only"
                  />
                  <span
                    className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform duration-fast hover:scale-110 peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    style={{ backgroundColor: preset.hex, color: accentForeground(preset.hex) }}
                  >
                    {active && <Check className="size-4" aria-hidden="true" />}
                  </span>
                </label>
              );
            })}
            <label
              className="ml-1 flex items-center gap-2 text-sm font-medium"
              htmlFor="welcome-accent-custom"
            >
              {t("settings.accent.custom_label")}
              <input
                id="welcome-accent-custom"
                type="color"
                value={accent}
                onChange={(e) => pickAccent(e.target.value)}
                data-selected={!isPreset}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:ring-2 data-[selected=true]:ring-fg"
              />
            </label>
          </div>
        </section>
      </div>

      <footer className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          className="neo-btn neo-btn-ghost"
          onClick={() => void finish("skip")}
          disabled={busy !== null}
        >
          {t("welcome.skip")}
        </button>
        <button
          type="button"
          className="neo-btn neo-btn-primary"
          onClick={() => void finish("start")}
          disabled={busy !== null}
        >
          {busy === "start" ? t("common.loading") : t("welcome.start")}
        </button>
      </footer>
    </div>
  );
}

function StepTitle({ n, id, label }: { n: number; id: string; label: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold tabular-nums text-primary-soft-fg">
        {n}
      </span>
      {label}
    </h2>
  );
}

/**
 * Mini preview (sidebar + card + button) drawn with the tokens of the given
 * theme: `data-theme-scope` applies the same tokens as `<html data-theme>`
 * to this block only. The accent comes from <html>, so it follows the live choice.
 */
function ThemePreview({ id }: { id: ThemeId }) {
  return (
    <span
      data-theme-scope={id}
      aria-hidden="true"
      className="flex h-24 overflow-hidden rounded-md border border-border bg-bg"
    >
      <span className="flex w-1/4 flex-col gap-1.5 border-r border-border bg-surface p-2">
        <span className="h-1.5 w-full rounded-sm bg-primary-soft" />
        <span className="h-1.5 w-3/4 rounded-sm bg-muted" />
        <span className="h-1.5 w-2/3 rounded-sm bg-muted" />
      </span>
      <span className="flex flex-1 items-center p-2.5">
        <span className="flex w-full flex-col gap-1.5 rounded-md border border-border bg-surface p-2 shadow-sm">
          <span className="h-1.5 w-2/3 rounded-sm bg-fg" />
          <span className="h-1.5 w-full rounded-sm bg-muted" />
          <span className="h-1.5 w-4/5 rounded-sm bg-muted" />
          <span className="mt-1 h-3.5 w-1/2 rounded-sm bg-primary" />
        </span>
      </span>
    </span>
  );
}
