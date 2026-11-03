/**
 * HTTP client for the Django backend.
 *
 * - CSRF token (reads the `csrftoken` cookie, passes it in `X-CSRFToken` for POST/PUT/PATCH/DELETE).
 * - credentials: 'include' so the session cookies travel.
 * - JSON parsing and typed errors.
 * - Supports FormData (for attachment uploads).
 *
 * In dev, leave `PUBLIC_API_URL` undefined: the browser uses relative `/api/*` and
 * the Vite proxy redirects to Django (the session cookie lives on the
 * frontend origin). Define `API_INTERNAL_URL` to point the proxy and SSR at the backend.
 * In prod (cross-origin), set `PUBLIC_API_URL` to the backend's absolute URL.
 */

import { getDocLang, t as translate } from "../i18n";
import { localizeApiError } from "../utils/apiErrors";

const API_BASE = (import.meta as unknown as { env: { PUBLIC_API_URL?: string } }).env.PUBLIC_API_URL ?? "";
const CSRF_COOKIE = "csrftoken";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  const existing = getCookie(CSRF_COOKIE);
  if (existing) return existing;
  try {
    await fetch(`${API_BASE}/api/auth/csrf/`, { credentials: "include" });
  } catch {
    throw new ApiError(0, translate(getDocLang(), "messages.network_error"));
  }
  return getCookie(CSRF_COOKIE) ?? "";
}

export class ApiError<TPayload = unknown> extends Error {
  constructor(
    public status: number,
    public detail: string,
    public payload?: TPayload,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiOptions {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
  /** If true, does not throw on 401 (useful for `me()` which returns null). */
  allowUnauthorized?: boolean;
  /** AbortController signal for cancellations. */
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  let body: BodyInit | undefined;
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined) {
    if (isFormData) {
      body = opts.body as FormData;
      // Let the browser set the Content-Type with the boundary.
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
  }

  if (method !== "GET") {
    // CSRF required for EVERY non-GET method — including FormData (uploads).
    // For FormData, the browser sets the Content-Type with the boundary; we
    // still send X-CSRFToken in the header anyway.
    const token = await ensureCsrfToken();
    if (token) headers["X-CSRFToken"] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body,
      signal: opts.signal,
    });
  } catch (err) {
    // Cancellations (AbortController) propagate as-is.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, translate(getDocLang(), "messages.network_error"));
  }

  if (res.status === 401 && opts.allowUnauthorized) {
    return null as T;
  }

  if (!res.ok) {
    let payload: unknown;
    try {
      const text = await res.text();
      if (text) payload = JSON.parse(text);
    } catch {
      // body is not JSON: only the status remains.
    }
    // The visible message comes out in the active language (see utils/apiErrors.ts); the
    // original payload stays available for anyone who needs the raw detail.
    throw new ApiError(res.status, localizeApiError(res.status, payload, getDocLang()), payload);
  }

  if (res.status === 204) return null as T;
  // For binary downloads we have no JSON, but apiFetch is meant for JSON.
  return (await res.json()) as T;
}

/** Helper for endpoints that return a Blob (downloads). */
export async function apiFetchBlob(path: string, opts: ApiOptions = {}): Promise<Blob> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const token = await ensureCsrfToken();
    if (token) headers["X-CSRFToken"] = token;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: opts.body as BodyInit | undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, translate(getDocLang(), "messages.network_error"));
  }
  if (!res.ok) throw new ApiError(res.status, localizeApiError(res.status, undefined, getDocLang()));
  return res.blob();
}
