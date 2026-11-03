/**
 * QuickLogModal — "Quick interaction log" modal.
 *
 * Endpoint: POST /api/persons/{id}/mark-contacted/ (kind=call, server-side).
 * Needs no body — the backend creates the interaction with occurred_at = now.
 */
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { toast } from "../../lib/toaster";
import { useTranslation } from "../../i18n";
import type { PersonListItem } from "../../types";
import { formatDateTime } from "../../utils/format";

interface Props {
  person: PersonListItem;
  onClose: () => void;
  onLogged: () => void;
}

function fullName(p: PersonListItem): string {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim() || "?";
}

export default function QuickLogModal({ person, onClose, onLogged }: Props) {
  const { t, lang } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // Close with Escape + autofocus the first control.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/persons/${person.id}/mark-contacted/`, { method: "POST" });
      toast.success(t("messages.interaction_logged"));
      onLogged();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quicklog-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="neo-card w-full max-w-md space-y-4 p-6 shadow-lg outline-none"
      >
        <header className="space-y-1">
          <h2 id="quicklog-title" className="text-sm font-semibold">
            {t("interaction.log_quick")}
          </h2>
          <p className="text-sm text-fg-muted">{fullName(person)}</p>
        </header>

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">{t("interaction.kind")}</dt>
            <dd className="font-medium">{t("enums.interaction.kinds.call")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">{t("interaction.channel")}</dt>
            <dd className="font-medium">{t("interaction.log_quick")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">{t("interaction.occurred_at")}</dt>
            <dd className="tabular-nums">{formatDateTime(new Date().toISOString(), lang)}</dd>
          </div>
        </dl>

        <footer className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="neo-btn">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={submit} disabled={busy} className="neo-btn neo-btn-primary">
            {busy ? (
              t("common.loading")
            ) : (
              <>
                <Check className="size-4" aria-hidden="true" />
                {t("common.confirm")}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
