/**
 * ImportExportTab — import contacts (vCard / Google CSV) and export them.
 *
 * Import: choose or drop a file -> `POST /api/persons/import/preview/` (does not
 * write) -> options -> `POST /api/persons/import/` with the same file.
 * Export: `GET /api/persons/export/` downloaded as a Blob.
 *
 * Uploads go as FormData: `apiFetch` does not force `Content-Type` in that case
 * (the browser sets the boundary) and still sends the CSRF token.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useTranslation } from "../../i18n";
import { apiFetch, apiFetchBlob, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import type { Tag } from "../../types";
import { formatDate } from "../../utils/format";

type DuplicateMode = "skip" | "merge" | "create";
type ExportFormat = "vcf" | "google_csv";
type ExportScope = "all" | "tag";

interface PreviewRow {
  row: number;
  name: string;
  company: string;
  phones: string[];
  emails: string[];
  birthday: string | null;
  duplicate_of: { id: number; name: string } | null;
}

interface RowError {
  row: number;
  message: string;
}

interface PreviewResponse {
  format: "vcard" | "google_csv";
  total: number;
  new: number;
  duplicates: number;
  errors: RowError[];
  rows: PreviewRow[];
}

interface ImportResult {
  created: number;
  merged: number;
  skipped: number;
  errors: RowError[];
}

type Phase = "idle" | "analyzing" | "ready" | "importing" | "done";

const ACCEPT = ".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv";
const DUPLICATE_MODES: DuplicateMode[] = ["skip", "merge", "create"];

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** `--03-15` -> `15/03`; `1990-03-15` -> `15/03/1990`. */
function birthdayText(value: string | null): string {
  if (!value) return "";
  if (value.startsWith("--")) {
    const [m, d] = value.slice(2).split("-");
    return m && d ? `${d}/${m}` : value;
  }
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.detail ? err.detail : fallback;
}

export default function ImportExportTab() {
  const { t, lang } = useTranslation();
  const uid = useId();

  return (
    <div className="space-y-8">
      <ImportSection t={t} lang={lang} uid={`${uid}-imp`} />
      <div className="border-t border-border pt-6">
        <ExportSection t={t} uid={`${uid}-exp`} />
      </div>
    </div>
  );
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/* ============================== Import ============================== */

function ImportSection({ t, lang, uid }: { t: TFn; lang: string; uid: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [duplicates, setDuplicates] = useState<DuplicateMode>("skip");
  const [tagName, setTagName] = useState("");
  const [importLabels, setImportLabels] = useState(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const pickFile = useCallback(
    async (picked: File | null | undefined) => {
      if (!picked) return;
      setFile(picked);
      setPreview(null);
      setResult(null);
      setError(null);
      setPhase("analyzing");
      setDuplicates("skip");
      setImportLabels(false);
      setTagName(t("importexport.tag_default", { date: formatDate(new Date().toISOString(), lang) }));
      const form = new FormData();
      form.append("file", picked);
      try {
        const data = await apiFetch<PreviewResponse>("/api/persons/import/preview/", {
          method: "POST",
          body: form,
        });
        setPreview(data);
        setPhase("ready");
      } catch (err) {
        setError(errorMessage(err, t("messages.error_generic")));
        setPhase("idle");
      } finally {
        // Allows choosing the same file again after an error.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [t, lang],
  );

  const toImport = preview
    ? duplicates === "skip"
      ? preview.new
      : preview.new + preview.duplicates
    : 0;

  const runImport = async () => {
    if (!file || !preview) return;
    setPhase("importing");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("duplicates", duplicates);
    form.append("tag", tagName.trim());
    form.append("import_labels", importLabels ? "true" : "false");
    try {
      const data = await apiFetch<ImportResult>("/api/persons/import/", {
        method: "POST",
        body: form,
      });
      setResult(data);
      setPhase("done");
    } catch (err) {
      setError(errorMessage(err, t("messages.error_generic")));
      setPhase("ready");
    }
  };

  const rowError = (e: RowError): string => {
    let reason = t("importexport.err_generic");
    if (/sin nombre/i.test(e.message)) reason = t("importexport.err_no_name");
    else if (/tarjeta/i.test(e.message)) reason = t("importexport.err_bad_card");
    else if (lang === "es" && e.message.trim()) reason = e.message;
    return t("importexport.error_row", { row: e.row, message: reason });
  };

  const busy = phase === "analyzing" || phase === "importing";

  return (
    <section aria-labelledby={`${uid}-title`} className="space-y-4">
      <div>
        <h2 id={`${uid}-title`} className="text-sm font-semibold">
          {t("importexport.import_title")}
        </h2>
        <p className="mt-1 text-xs text-fg-muted">{t("importexport.import_intro")}</p>
      </div>

      {(phase === "idle" || phase === "analyzing") && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) void pickFile(e.dataTransfer.files?.[0]);
            }}
            className={[
              "flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors duration-fast",
              dragging ? "border-primary bg-primary-soft" : "border-border bg-surface",
            ].join(" ")}
          >
            <FileUp className="size-6 text-fg-muted" aria-hidden="true" />
            <p className="text-sm font-medium">{t("importexport.drop_title")}</p>
            <p className="text-xs text-fg-muted">{t("importexport.drop_hint")}</p>
            <input
              ref={inputRef}
              id={`${uid}-file`}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={busy}
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
            <label
              htmlFor={`${uid}-file`}
              className={[
                "neo-btn neo-btn-sm cursor-pointer",
                busy ? "pointer-events-none opacity-60" : "",
              ].join(" ")}
            >
              {phase === "analyzing" ? t("importexport.analyzing") : t("importexport.choose_file")}
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          )}

          <div className="rounded-md bg-muted p-4">
            <h3 className="text-xs font-semibold">{t("importexport.help_title")}</h3>
            <ul className="mt-2 space-y-1 text-xs text-fg-muted">
              <li>{t("importexport.help_android")}</li>
              <li>{t("importexport.help_iphone")}</li>
              <li>{t("importexport.help_google")}</li>
            </ul>
          </div>
        </>
      )}

      {preview && file && (phase === "ready" || phase === "importing") && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium">
              {t("importexport.summary_title", { file: file.name })}
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
                {preview.format === "vcard"
                  ? t("importexport.format_vcard")
                  : t("importexport.format_google_csv")}
              </span>
            </p>
            <button type="button" className="neo-btn neo-btn-sm" onClick={reset} disabled={busy}>
              {t("importexport.change_file")}
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("importexport.stat_total")} value={preview.total} />
            <Stat label={t("importexport.stat_new")} value={preview.new} />
            <Stat label={t("importexport.stat_duplicates")} value={preview.duplicates} />
            <Stat label={t("importexport.stat_errors")} value={preview.errors.length} />
          </dl>

          {preview.rows.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-fg-muted">
                {t("importexport.preview_title")}
              </h3>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-muted text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{t("importexport.col_name")}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t("importexport.col_company")}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t("importexport.col_phone")}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t("importexport.col_email")}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t("importexport.col_birthday")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-border align-top">
                        <td className="w-full px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium" title={r.name}>{r.name}</span>
                            {r.duplicate_of && (
                              <span
                                className="inline-block max-w-[14rem] shrink-0 truncate rounded-full bg-status-due-soon px-2 py-0.5 text-xs font-medium text-status-due-soon-fg"
                                title={t("importexport.duplicate_of", { name: r.duplicate_of.name })}
                              >
                                {t("importexport.duplicate_of", { name: r.duplicate_of.name })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-fg-muted">{r.company}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg-muted">{r.phones[0] ?? ""}</td>
                        <td className="px-3 py-2 text-fg-muted">{r.emails[0] ?? ""}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg-muted">{birthdayText(r.birthday)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.total - preview.errors.length > preview.rows.length && (
                <p className="mt-2 text-xs text-fg-muted">
                  {t("importexport.preview_cap", {
                    shown: preview.rows.length,
                    total: preview.total - preview.errors.length,
                  })}
                </p>
              )}
            </div>
          )}

          {preview.errors.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold text-fg-muted">
                {t("importexport.errors_title")}
              </h3>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-fg-muted">
                {preview.errors.map((e) => (
                  <li key={e.row}>{rowError(e)}</li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="space-y-4" disabled={phase === "importing"}>
            <legend className="text-xs font-semibold text-fg-muted">
              {t("importexport.options_title")}
            </legend>

            <div role="radiogroup" aria-labelledby={`${uid}-dup`} className="space-y-2">
              <p id={`${uid}-dup`} className="text-sm font-medium">
                {t("importexport.duplicates_label")}
              </p>
              {DUPLICATE_MODES.map((mode) => (
                <label key={mode} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${uid}-dup`}
                    className="mt-0.5 size-4"
                    checked={duplicates === mode}
                    onChange={() => setDuplicates(mode)}
                  />
                  <span>
                    <span className="font-medium">{t(`importexport.dup_${mode}`)}</span>
                    <span className="block text-xs text-fg-muted">
                      {t(`importexport.dup_${mode}_help`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="max-w-sm">
              <label htmlFor={`${uid}-tag`} className="mb-1.5 block text-sm font-medium">
                {t("importexport.tag_label")}
              </label>
              <input
                id={`${uid}-tag`}
                type="text"
                className="neo-input"
                maxLength={50}
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-fg-muted">{t("importexport.tag_help")}</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded"
                checked={importLabels}
                onChange={(e) => setImportLabels(e.target.checked)}
              />
              {t("importexport.import_labels")}
            </label>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {toImport === 0 && (
              <p className="text-xs text-fg-muted">{t("importexport.nothing_to_import")}</p>
            )}
            <button
              type="button"
              className="neo-btn neo-btn-sm neo-btn-primary"
              onClick={() => void runImport()}
              disabled={phase === "importing" || toImport === 0}
            >
              {phase === "importing"
                ? t("importexport.importing")
                : t("importexport.import_button", { count: toImport })}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4" role="status">
          <h3 className="text-sm font-semibold">{t("importexport.done_title")}</h3>
          <ul className="space-y-1 text-sm">
            <li>{t("importexport.done_created", { count: result.created })}</li>
            {result.merged > 0 && <li>{t("importexport.done_merged", { count: result.merged })}</li>}
            {result.skipped > 0 && <li>{t("importexport.done_skipped", { count: result.skipped })}</li>}
            {result.errors.length > 0 && (
              <li className="text-accent">
                {t("importexport.done_errors", { count: result.errors.length })}
              </li>
            )}
          </ul>
          {result.errors.length > 0 && (
            <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-fg-muted">
              {result.errors.map((e, i) => (
                <li key={`${e.row}-${i}`}>{rowError(e)}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href="/persons/" className="neo-btn neo-btn-sm neo-btn-primary no-underline">
              {t("importexport.go_persons")}
            </a>
            <button type="button" className="neo-btn neo-btn-sm" onClick={reset}>
              {t("importexport.import_another")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/* ============================== Export ============================== */

function ExportSection({ t, uid }: { t: TFn; uid: string }) {
  const [format, setFormat] = useState<ExportFormat>("vcf");
  const [scope, setScope] = useState<ExportScope>("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagId, setTagId] = useState<string>("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Tag[]>("/api/tags/", { signal: controller.signal })
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const needsTag = scope === "tag" && tagId === "";

  const download = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ format, include_notes: includeNotes ? "1" : "0" });
      if (scope === "tag" && tagId) params.set("tag", tagId);
      const blob = await apiFetchBlob(`/api/persons/export/?${params.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `simple-crm-contacts-${todayIso()}.${format === "vcf" ? "vcf" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("importexport.downloaded"));
    } catch (err) {
      toast.error(errorMessage(err, t("messages.error_generic")));
    } finally {
      setBusy(false);
    }
  };

  const formats: { key: ExportFormat; label: string }[] = [
    { key: "vcf", label: t("importexport.fmt_vcf") },
    { key: "google_csv", label: t("importexport.fmt_google_csv") },
  ];

  return (
    <section aria-labelledby={`${uid}-title`} className="space-y-4">
      <div>
        <h2 id={`${uid}-title`} className="text-sm font-semibold">
          {t("importexport.export_title")}
        </h2>
        <p className="mt-1 text-xs text-fg-muted">{t("importexport.export_intro")}</p>
      </div>

      <div role="radiogroup" aria-labelledby={`${uid}-fmt`} className="space-y-2">
        <p id={`${uid}-fmt`} className="text-sm font-medium">
          {t("importexport.export_format")}
        </p>
        {formats.map((f) => (
          <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${uid}-fmt`}
              className="size-4"
              checked={format === f.key}
              onChange={() => setFormat(f.key)}
            />
            {f.label}
          </label>
        ))}
      </div>

      <div role="radiogroup" aria-labelledby={`${uid}-scope`} className="space-y-2">
        <p id={`${uid}-scope`} className="text-sm font-medium">
          {t("importexport.export_scope")}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${uid}-scope`}
            className="size-4"
            checked={scope === "all"}
            onChange={() => setScope("all")}
          />
          {t("importexport.scope_all")}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${uid}-scope`}
            className="size-4"
            checked={scope === "tag"}
            onChange={() => setScope("tag")}
          />
          {t("importexport.scope_tag")}
        </label>
        {scope === "tag" && (
          <div className="max-w-xs pl-6">
            <select
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              aria-label={t("importexport.scope_tag_pick")}
              className="neo-input"
            >
              <option value="">{t("importexport.scope_tag_none")}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={String(tag.id)}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded"
            checked={includeNotes}
            onChange={(e) => setIncludeNotes(e.target.checked)}
          />
          {t("importexport.include_notes")}
        </label>
        {includeNotes && (
          <p className="mt-1.5 pl-6 text-xs text-accent">{t("importexport.notes_warning")}</p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="neo-btn neo-btn-sm neo-btn-primary"
          onClick={() => void download()}
          disabled={busy || needsTag}
        >
          {busy ? t("importexport.downloading") : t("importexport.download")}
        </button>
      </div>
    </section>
  );
}
