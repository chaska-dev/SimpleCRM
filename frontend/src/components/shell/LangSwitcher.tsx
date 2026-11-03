import { useState } from "react";
import SegmentedControl from "../ui/SegmentedControl";
import { changeLanguage, changeLanguageAnonymous } from "../../utils/prefs";
import { t as translate, withLang } from "../../i18n";
import type { Lang } from "../../types";

interface Props {
  /** Current language (the one the server decided). */
  lang: Lang;
  /** `anonymous` = login/register (cookie only); `user` = also saves to the backend. */
  mode?: "user" | "anonymous";
}

/**
 * LangSwitcher — compact `ES | EN` control.
 *
 * With a session: PATCH /api/auth/me/ + cookie + reload. Without a session: cookie only
 * + reload. The reload is acceptable because it changes all the server HTML.
 */
function LangSwitcher({ lang, mode = "user" }: Props) {
  const [busy, setBusy] = useState(false);

  const onChange = async (next: Lang) => {
    if (next === lang || busy) return;
    setBusy(true);
    if (mode === "anonymous") changeLanguageAnonymous(next);
    else await changeLanguage(next);
  };

  return (
    <SegmentedControl<Lang>
      ariaLabel={translate(lang, "lang.switch_label")}
      value={lang}
      onChange={onChange}
      options={[
        { key: "es", label: "ES" },
        { key: "en", label: "EN" },
      ]}
    />
  );
}

export default withLang(LangSwitcher);
