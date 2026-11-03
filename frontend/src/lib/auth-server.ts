/**
 * Auth helpers for SSR (Astro server-side).
 *
 * In SSR, `document.cookie` does not exist and `fetch` does not auto-forward the
 * browser's Django session cookie. We need to take the cookie from the Astro
 * request and forward it to the backend explicitly.
 *
 * Canonical helper for authenticated pages: `meSSR(Astro)` returns the user
 * (or null) and each page does its redirect inline; see the "Helpers to
 * authenticate pages server-side" block below.
 */

import type { APIContext, AstroGlobal } from "astro";
import type { Lang, User } from "../types";
import { DEFAULT_ACCENT, DEFAULT_THEME, isValidHex, type ThemeId } from "../styles/themes";

// Without @types/node installed: only what is used from `process` is declared.
declare const process: { env?: Record<string, string | undefined> } | undefined;

/**
 * Backend URL for SSR. Priority: `API_INTERNAL_URL` (server only, without the
 * PUBLIC_ prefix so it never reaches the client bundle), then `PUBLIC_API_URL`,
 * then port 8000 by default. This file runs only on the server.
 */
export function getApiBase(): string {
  const internal =
    typeof process !== "undefined" ? process.env?.API_INTERNAL_URL : undefined;
  const publicUrl = (import.meta as unknown as { env?: { PUBLIC_API_URL?: string } }).env
    ?.PUBLIC_API_URL;
  const base = internal || publicUrl || "http://127.0.0.1:8000";
  return base.replace(/\/$/, "");
}

type Ctx = AstroGlobal | APIContext;

function cookieHeader(ctx: Ctx): string {
  return ctx.request.headers.get("cookie") ?? "";
}

/** Resolved interface preferences for a request (see `resolvePrefs`). */
export interface Prefs {
  lang: Lang;
  theme: ThemeId;
  accent: string;
}

/**
 * Request user. The first call does the fetch, stores it in
 * `locals.user` and resolves language/theme/accent (`locals.prefs`, read by
 * `Layout.astro`); it also aligns the `preferred_*` cookies with the user
 * (the backend only sets them on login and on /me/ called from the browser).
 * Later calls in the same request reuse the result.
 */
export async function meSSR(ctx: Ctx): Promise<User | null> {
  const locals = ctx.locals as { user?: User | null; prefs?: Prefs };
  if (locals.user !== undefined) return locals.user;
  const user = await fetchMe(ctx);
  locals.user = user;
  locals.prefs = resolvePrefs(ctx, user);
  if (user) syncPrefCookies(ctx, locals.prefs);
  return user;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Writes the preference cookies that differ from the ones the browser sent. */
function syncPrefCookies(ctx: Ctx, prefs: Prefs): void {
  const wanted: Record<string, string> = {
    preferred_lang: prefs.lang,
    preferred_theme: prefs.theme,
    preferred_accent: prefs.accent,
  };
  for (const [name, value] of Object.entries(wanted)) {
    if (ctx.cookies.get(name)?.value !== value) {
      ctx.cookies.set(name, value, {
        path: "/",
        maxAge: ONE_YEAR,
        sameSite: "lax",
        httpOnly: false,
        secure: new URL(ctx.request.url).protocol === "https:",
      });
    }
  }
}

/**
 * True if the user has not yet completed (or skipped) /welcome/. Compares
 * `=== false` so a backend without the field does not force the welcome.
 *
 *   const user = await meSSR(Astro);
 *   if (!user) return Astro.redirect("/login/");
 *   if (needsOnboarding(user)) return Astro.redirect("/welcome/");
 */
export function needsOnboarding(user: User): boolean {
  return user.onboarding_completed === false;
}

/** Direct fetch of `/api/auth/me/` forwarding the session cookie. */
export async function fetchMe(ctx: Ctx): Promise<User | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/me/`, {
      headers: { Cookie: cookieHeader(ctx) },
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch (_) {
    return null;
  }
}

export async function csrfSSR(ctx: Ctx): Promise<string> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/csrf/`, {
      headers: { Cookie: cookieHeader(ctx) },
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch (_) {
    return "";
  }
}

/**
 * Registration status. `error: true` = the backend did not respond properly (down or
 * non-ok response); it does not mean "registration closed" (that is `can_register: false`
 * without `error`).
 */
export async function registrationStatusSSR(
  ctx: Ctx,
): Promise<{ can_register: boolean; users_count: number; error?: boolean }> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/registration-status/`, {
      headers: { Cookie: cookieHeader(ctx) },
    });
    if (!res.ok) return { can_register: false, users_count: 0, error: true };
    return await res.json();
  } catch (_) {
    return { can_register: false, users_count: 0, error: true };
  }
}

/**
 * Helpers to authenticate pages server-side.
 *
 * In Astro 5 + `output: 'server'`, the canonical pattern in the frontmatter of each
 * authenticated page is:
 *
 *   const user = await meSSR(Astro);
 *   if (!user) return Astro.redirect("/login/");
 *
 * This works because `return` in the page frontmatter emits the redirect
 * before the HTML starts streaming. If the redirect goes inside a
 * sub-component (helper) or `<Layout>`, the stream is not closed and Astro responds
 * with an empty body + status 200 (Astro 5 bug with streaming + redirects from
 * components). That is why each page does the redirect inline and passes the user
 * to AppShell as a prop.
 */

function readCookie(ctx: Ctx, name: string): string | null {
  const cookie = ctx.request.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

/** `Accept-Language` -> supported language (`en*` -> en, anything else -> es). */
function langFromAcceptLanguage(ctx: Ctx): Lang {
  const header = (ctx.request.headers.get("accept-language") ?? "").trim().toLowerCase();
  return header.startsWith("en") ? "en" : "es";
}

/**
 * Current preferences. With a session the user decides; without one, the cookie
 * (language, theme, accent) and, if there is no language cookie, `Accept-Language`.
 */
export function resolvePrefs(ctx: Ctx, user: User | null): Prefs {
  const cookieLang = readCookie(ctx, "preferred_lang");
  const cookieTheme = readCookie(ctx, "preferred_theme");
  const cookieAccent = readCookie(ctx, "preferred_accent");

  const lang: Lang =
    user?.preferred_lang === "en" || user?.preferred_lang === "es"
      ? user.preferred_lang
      : cookieLang === "en" || cookieLang === "es"
        ? cookieLang
        : langFromAcceptLanguage(ctx);

  const theme: ThemeId =
    user?.preferred_theme === "dark" || user?.preferred_theme === "light"
      ? user.preferred_theme
      : cookieTheme === "dark" || cookieTheme === "light"
        ? cookieTheme
        : DEFAULT_THEME;

  const accentCandidate = user?.preferred_accent ?? cookieAccent ?? "";
  const accent = isValidHex(accentCandidate) ? accentCandidate.toLowerCase() : DEFAULT_ACCENT;

  return { lang, theme, accent };
}

/**
 * Active language of the request. Resolved by `meSSR` (user > cookie >
 * Accept-Language) and stored in `locals.prefs`; pages read it from here. The name is kept for
 * compatibility with the existing pages.
 */
export function readLangCookie(ctx: Ctx): Lang {
  const prefs = (ctx.locals as { prefs?: Prefs }).prefs;
  if (prefs) return prefs.lang;
  return resolvePrefs(ctx, (ctx.locals as { user?: User | null }).user ?? null).lang;
}
