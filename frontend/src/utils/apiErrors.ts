/**
 * Backend error messages -> text in the active language.
 *
 * The backend responds in fixed Spanish (`LANGUAGE_CODE = es-cl`). So the
 * interface does not mix languages, `apiFetch` passes every error through here:
 *   1. If the message matches a known pattern -> i18n key `api_errors.*`.
 *   2. If it does not match and the language is `es` -> shown as it came.
 *   3. If it does not match and the language is `en` -> generic message by status.
 * The original payload remains available in `ApiError.payload`.
 *
 * When adding a new message in the backend, add its pattern here and the key
 * in `es.json` / `en.json`.
 */

import { t } from "../i18n";
import type { Lang } from "../types";

interface Rule {
  pattern: RegExp;
  key: string;
  /** Names of the variables taken from the capture groups, in order. */
  vars?: string[];
}

const RULES: Rule[] = [
  { pattern: /selecciona un archivo \.vcf/i, key: "api_errors.import_no_file" },
  { pattern: /formato de archivo no reconocido/i, key: "api_errors.import_format" },
  { pattern: /el archivo est[aá] vac[ií]o/i, key: "api_errors.import_empty" },
  { pattern: /el archivo tiene m[aá]s de (\d+) contactos/i, key: "api_errors.import_too_many", vars: ["n"] },
  { pattern: /demasiados intentos/i, key: "auth.too_many_attempts" },
  { pattern: /credenciales inv[aá]lidas/i, key: "api_errors.invalid_credentials" },
  { pattern: /email y password son requeridos/i, key: "api_errors.credentials_required" },
  { pattern: /contrase[nñ]as no coinciden/i, key: "api_errors.password_mismatch" },
  { pattern: /registro est[aá] cerrado/i, key: "auth.register_closed" },
  { pattern: /ya existe una cuenta con ese correo/i, key: "api_errors.email_taken" },
  { pattern: /demasiado corta/i, key: "api_errors.password_short" },
  { pattern: /demasiado com[uú]n/i, key: "api_errors.password_common" },
  { pattern: /completamente num[eé]rica/i, key: "api_errors.password_numeric" },
  { pattern: /(muy|demasiado) similar/i, key: "api_errors.password_similar" },
  { pattern: /contrase[nñ]a/i, key: "api_errors.password_weak" },
  { pattern: /m[aá]ximo 60 caracteres/i, key: "api_errors.max_60" },
  {
    pattern: /imagen demasiado grande \((\d+) KB\)\. m[aá]ximo (\d+) (KB|MB)/i,
    key: "api_errors.image_too_big",
    vars: ["kb", "max", "unit"],
  },
  { pattern: /formato no permitido/i, key: "api_errors.image_format" },
  { pattern: /no es una imagen png/i, key: "api_errors.image_not_image" },
  { pattern: /no se pudo leer la imagen/i, key: "api_errors.image_unreadable" },
  { pattern: /dimensiones de la imagen/i, key: "api_errors.image_pixels" },
  { pattern: /recorte no es v[aá]lido/i, key: "api_errors.image_crop_invalid" },
  { pattern: /recorte queda fuera/i, key: "api_errors.image_crop_range" },
  { pattern: /demasiados cuadros \(m[aá]ximo (\d+)\)/i, key: "api_errors.image_frames", vars: ["n"] },
  { pattern: /selecciona una imagen/i, key: "api_errors.image_required" },
  { pattern: /no pertenece al usuario actual|deben pertenecer al usuario actual/i, key: "api_errors.not_owner" },
  { pattern: /el nombre es obligatorio/i, key: "api_errors.name_required" },
  { pattern: /ya (ten[eé]s|tienes) una instituci[oó]n con ese nombre/i, key: "api_errors.org_name_taken" },
  { pattern: /ya tiene ese rol/i, key: "api_errors.member_role_taken" },
  { pattern: /a[nñ]o de fin no puede/i, key: "api_errors.end_before_start" },
  {
    pattern: /el archivo excede el l[ií]mite de (\d+) MB/i,
    key: "api_errors.file_too_big",
    vars: ["mb"],
  },
  { pattern: /tipo de archivo no permitido/i, key: "api_errors.file_type" },
  {
    pattern: /excedes la cuota de (\d+) MB.*us(?:[aá]s|as) (\d+) MB/i,
    key: "api_errors.quota",
    vars: ["max", "used"],
  },
  { pattern: /thumbnails solo disponibles/i, key: "api_errors.thumb_images_only" },
  { pattern: /ya estaba completado/i, key: "api_errors.already_completed" },
  { pattern: /no (?:pod[eé]s|puedes) borrar|no autorizado|no tiene permiso/i, key: "api_errors.forbidden" },
  {
    pattern: /no existe|no encontrado|referenciado no existe|modelo desconocido|no es un contenttype/i,
    key: "api_errors.not_found",
  },
  { pattern: /credenciales de autenticaci[oó]n/i, key: "api_errors.unauthorized" },
  { pattern: /este campo (es requerido|no puede ser nulo|no puede estar en blanco)|falta /i, key: "api_errors.field_required" },
  { pattern: /direcci[oó]n de correo|correo electr[oó]nico v[aá]lido/i, key: "api_errors.email_invalid" },
  { pattern: /url v[aá]lida/i, key: "api_errors.url_invalid" },
  {
    pattern: /no tenga m[aá]s de (\d+) caracteres/i,
    key: "api_errors.max_chars",
    vars: ["n"],
  },
  { pattern: /ya existe|debe ser [uú]nic|con este valor/i, key: "api_errors.duplicate" },
  { pattern: /fecha inv[aá]lida|formato de fecha|formato de hora|datetime has wrong|date has wrong|date format/i, key: "api_errors.date_invalid" },
  { pattern: /n[uú]mero (entero )?v[aá]lido|entero v[aá]lido/i, key: "api_errors.number_invalid" },
];

/** Generic message by HTTP status. */
export function statusMessage(status: number, lang: Lang): string {
  if (status === 0) return t(lang, "messages.network_error");
  if (status === 401) return t(lang, "api_errors.unauthorized");
  if (status === 403) return t(lang, "api_errors.forbidden");
  if (status === 404) return t(lang, "api_errors.not_found");
  if (status === 413) return t(lang, "api_errors.too_large");
  if (status === 429) return t(lang, "auth.too_many_attempts");
  if (status >= 500) return t(lang, "api_errors.server");
  return t(lang, "messages.error_generic");
}

function translateOne(raw: string, status: number, lang: Lang): string {
  for (const rule of RULES) {
    const m = rule.pattern.exec(raw);
    if (!m) continue;
    const vars: Record<string, string | number> = {};
    rule.vars?.forEach((name, i) => {
      vars[name] = m[i + 1] ?? "";
    });
    return t(lang, rule.key, vars);
  }
  // No known pattern: in Spanish the original is shown (the backend is already
  // in Spanish); in English, the generic one so languages are not mixed.
  return lang === "es" && raw.trim() ? raw : statusMessage(status, lang);
}

/** Flattens the DRF payload (`detail`, list, or `{field: [msgs]}`) into a list of messages. */
function collectMessages(payload: unknown): string[] {
  if (typeof payload === "string") return [payload];
  if (Array.isArray(payload)) return payload.flatMap(collectMessages);
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.detail === "string") return [obj.detail];
    return Object.values(obj).flatMap(collectMessages);
  }
  return [];
}

/** Final text for the user from the backend's error response. */
export function localizeApiError(status: number, payload: unknown, lang: Lang): string {
  const raws = collectMessages(payload);
  // Response without a JSON body (proxy, 502...): only the status is known.
  if (raws.length === 0) return statusMessage(status, lang);
  const out: string[] = [];
  for (const raw of raws) {
    const text = translateOne(raw, status, lang);
    if (!out.includes(text)) out.push(text);
  }
  return out.join(" ");
}
