/**
 * EncryptionTab — read-only info about encryption at rest.
 *
 * Lists what is stored encrypted (notes, messages, "how we met" and
 * attachments) and warns that the key cannot be recovered. It does not expose
 * technical server details.
 */

import { Lock } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { Lang } from "../../types";

interface Props {
  lang?: Lang;
}

export default function EncryptionTab(_props: Props) {
  const { t } = useTranslation();

  const fields = [
    "settings.encryption.field_notes",
    "settings.encryption.field_messages",
    "settings.encryption.field_how_we_met",
    "settings.encryption.field_attachments",
  ];

  return (
    <div className="divide-y divide-border">
      <section className="py-5 first:pt-0">
        <h2 className="text-sm font-semibold">{t("settings.tabs.encryption")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.encryption.intro")}</p>

        <h3 className="mt-4 text-sm font-semibold">{t("settings.encryption.fields_title")}</h3>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
          {fields.map((key) => (
            <li key={key} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Lock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section role="alert" className="py-5 last:pb-0">
        <h3 className="text-sm font-semibold">{t("settings.encryption.warning_title")}</h3>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.encryption.warning_body")}</p>
      </section>
    </div>
  );
}
