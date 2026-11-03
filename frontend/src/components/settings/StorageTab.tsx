/**
 * StorageTab — recent attachments list only.
 *
 * Personal v1: we do NOT show a quota meter (it does not apply to a
 * single-user CRM). When a dedicated backend endpoint exists
 * (`/api/attachments/usage/`), we will add it as an optional block.
 *
 * NOTE: the `useEffect` runs with deps `[]` to avoid the infinite loop
 * that Agent H's v1 had (`useEffect([t])` caused a DDoS on the backend
 * because `t` changes reference on every render). We use a ref to
 * always have the current `t` inside the effect without re-running it.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { BorderedListSkeleton, LoadingSwap, StorageRowSkeleton } from "../ui";
import type { Attachment } from "../../types";
import { formatDateTime } from "../../utils/format";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function StorageTab() {
  const { t, lang } = useTranslation();
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The effect depends only on `lang`; the ref gives it the current `t` without
  // re-triggering the load if the identity of `t` changes.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch<Attachment[] | { results?: Attachment[] }>(
      "/api/attachments/?limit=10",
      { signal: controller.signal },
    )
      .then((data) => {
        if (Array.isArray(data)) {
          setAttachments(data);
        } else if (data && Array.isArray(data.results)) {
          setAttachments(data.results);
        } else {
          setAttachments([]);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError) {
          setAttachments([]);
        } else {
          setError(tRef.current("settings.storage.attachments_error"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const doRetry = () => {
    // Manual re-fire. The effect runs on [lang], so we would mutate local lang
    // via the hook? No — it is simpler: toggle `loading`/`attachments` to
    // force the effect. Since deps is [lang] and lang does not change, this actually
    // only resets the UI. The real retry is refreshing the page.
    setAttachments(null);
    setError(null);
    setLoading(true);
    // We force a reload — it is the simplest and clearest option for the user.
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">{t("settings.storage.attachments_title")}</h2>

      <LoadingSwap
        loading={loading}
        label={t("settings.storage.attachments_loading")}
        skeleton={<BorderedListSkeleton rows={3} row={() => <StorageRowSkeleton />} />}
      >
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-accent">{error}</p>
          <button type="button" className="neo-btn neo-btn-sm" onClick={doRetry}>
            {t("common.confirm")}
          </button>
        </div>
      ) : !attachments || attachments.length === 0 ? (
        <p className="text-xs text-fg-muted">{t("settings.storage.attachments_empty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1 truncate font-medium text-fg">
                {a.title || a.original_filename}
              </span>
              <span className="whitespace-nowrap text-xs text-fg-muted tabular-nums">
                {formatBytes(a.size_bytes)}
              </span>
              <span
                className="hidden whitespace-nowrap text-xs text-fg-muted tabular-nums sm:inline"
              >
                {formatDateTime(a.uploaded_at, lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
      </LoadingSwap>
    </section>
  );
}
