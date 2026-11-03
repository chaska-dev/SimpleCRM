/**
 * i18n helper. The active language comes from the server (cookie `preferred_lang` ->
 * `<html lang>`); here we only translate: t(lang, key).
 *
 * To keep it simple and avoid loading a heavy lib: keys are looked up
 * with dot notation (`shell.app_name`, `enums.interaction.kinds.call`).
 *
 * If richer pluralization/interpolation is needed later, switch to
 * `i18next` or similar — the JSON shape does not need to change.
 */

import { createContext, createElement, useCallback, useContext, type ComponentType } from "react";
import es from "./es.json";
import en from "./en.json";
import type { Lang } from "../types";

export type Translations = typeof es;

const ALL: Record<Lang, Translations> = { es, en };

/** Cookie read by SSR (written by the backend on login and by the frontend when changing language). */
export const LANG_COOKIE = "preferred_lang";

/**
 * Active language in the browser: decided by the server and stored in
 * `<html lang>`. Never read from localStorage (SSR and hydration must match).
 */
export function getDocLang(): Lang {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang === "en" ? "en" : "es";
}

type Dict = Record<string, unknown>;

function lookup(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (typeof acc !== "object" || acc === null) return undefined;
    return (acc as Dict)[segment];
  }, dict);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

/** Simple pluralizer (minimal form): picks one of two branches by `one` / `other`. */
function plural(template: string, count: number): string {
  return template
    .replace(/#/g, String(count))
    .replace(/\{count, plural, one \{(.+?)\} other \{(.+?)\}\}/, (_, one, other) =>
      count === 1 ? one : other,
    );
}

export function t(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = ALL[lang] as unknown as Dict;
  const value = lookup(dict, key);
  if (typeof value !== "string") {
    // Fallback to Spanish so it never breaks.
    const fallback = lookup(ALL.es as unknown as Dict, key);
    return typeof fallback === "string" ? interpolate(fallback, vars) : key;
  }
  // Plural first (only if there is a `count`) and then variables: an interpolated value
  // that contains "#" (e.g. a hex color) must not be confused with the counter.
  const pluralized = vars?.count === undefined ? value : plural(value, Number(vars.count));
  return interpolate(pluralized, vars);
}

/**
 * Language context. Each root React island is wrapped with `withLang` and receives
 * the server language via prop: so SSR render and hydration use the
 * same value (`document` does not exist in SSR).
 */
export const LangContext = createContext<Lang | null>(null);

/** Wraps a root island: takes `lang` (or `initialLang`) from its props and provides it. */
export function withLang<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function WithLang(props: P) {
    const p = props as { lang?: Lang; initialLang?: Lang };
    const lang = p.lang ?? p.initialLang ?? getDocLang();
    return createElement(
      LangContext.Provider,
      { value: lang },
      createElement(Component as ComponentType<Record<string, unknown>>, props as Record<string, unknown>),
    );
  }
  WithLang.displayName = `withLang(${Component.displayName ?? Component.name ?? "Island"})`;
  return WithLang;
}

/** Translation hook: the language comes from the island's context (or from `<html lang>`). */
export function useTranslation(): {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
} {
  const ctx = useContext(LangContext);
  const lang: Lang = ctx ?? getDocLang();

  // `t` memoized: same identity while `lang` does not change. Without this, the
  // components that put it in useCallback/useEffect deps trigger refs
  // in a loop (PersonsListView ended up showing "loading..." forever).
  const tFn = useCallback(
    (key: string, vars?: Record<string, string | number>) => t(lang, key, vars),
    [lang],
  );

  return { lang, t: tFn };
}
