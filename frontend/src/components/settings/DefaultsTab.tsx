/**
 * DefaultsTab — per-user defaults when creating a person.
 *
 * There is no backend endpoint for these defaults today: they are stored only in the
 * browser's `localStorage` (not synced across devices). If the
 * backend adds a preferences field, the save handler would switch to
 * `savePrefs`/`apiFetch` keeping the same UX.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "../../i18n";
import { toast } from "../../lib/toaster";
import type { Lang } from "../../types";

interface Props {
  lang?: Lang; // Received from SettingsView for consistency; unused in v1.
}

interface DefaultsState {
  cadenceDays: number;
  howWeMet: string;
}

const STORAGE_KEY = "person_defaults_v1";

function loadFromStorage(): DefaultsState {
  if (typeof window === "undefined") {
    return { cadenceDays: 30, howWeMet: "" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cadenceDays: 30, howWeMet: "" };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { cadenceDays: 30, howWeMet: "" };
    }
    const obj = parsed as Record<string, unknown>;
    const cadence = typeof obj.cadenceDays === "number" ? obj.cadenceDays : 30;
    const how = typeof obj.howWeMet === "string" ? obj.howWeMet : "";
    return { cadenceDays: cadence, howWeMet: how };
  } catch (_) {
    return { cadenceDays: 30, howWeMet: "" };
  }
}

export default function DefaultsTab(_props: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<DefaultsState>(() => loadFromStorage());
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      toast.success(t("settings.defaults.saved"));
    } catch (_) {
      toast.error(t("messages.error_generic"));
    } finally {
      setSaving(false);
    }
  }, [state, t]);

  return (
    <section>
      <h2 className="text-sm font-semibold">{t("settings.tabs.defaults")}</h2>
      <p className="mt-1 text-xs text-fg-muted">
        {t("settings.defaults.intro")} {t("settings.defaults.coming_soon_body")}
      </p>

      <div className="mt-4 max-w-sm space-y-4">
        {/* Cadence */}
        <div>
          <label htmlFor="defaults-cadence" className="mb-1.5 block text-sm font-medium">
            {t("settings.defaults.field_cadence")}
          </label>
          <input
            id="defaults-cadence"
            type="number"
            min={0}
            max={3650}
            className="neo-input"
            value={state.cadenceDays}
            onChange={(e) => {
              const v = Number(e.target.value);
              setState((s) => ({ ...s, cadenceDays: Number.isFinite(v) ? v : 0 }));
            }}
            disabled={saving}
          />
          <p className="mt-1.5 text-xs text-fg-muted">{t("settings.defaults.field_cadence_help")}</p>
        </div>

        {/* How we met */}
        <div>
          <label htmlFor="defaults-how-we-met" className="mb-1.5 block text-sm font-medium">
            {t("settings.defaults.field_how_we_met")}
          </label>
          <textarea
            id="defaults-how-we-met"
            className="neo-input"
            rows={3}
            value={state.howWeMet}
            onChange={(e) => setState((s) => ({ ...s, howWeMet: e.target.value }))}
            disabled={saving}
            placeholder={t("person.fields.how_we_met")}
          />
          <p className="mt-1.5 text-xs text-fg-muted">{t("settings.defaults.field_how_we_met_help")}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="neo-btn neo-btn-sm neo-btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </section>
  );
}
