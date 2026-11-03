/**
 * TopBarUser — user avatar + name in the top bar.
 *
 * It is a React island (unlike the rest of the TopBar, which is pure Astro)
 * so it can react to the `crm:user-updated` event: when the photo or
 * name is saved in Settings it updates here without reloading the page.
 */
import { useEffect, useState } from "react";
import Avatar from "../ui/Avatar";
import { getMediaUrl } from "../../lib/media";
import { withLang } from "../../i18n";
import { migrateLegacyPrefs } from "../../utils/prefs";
import type { Lang, User } from "../../types";

interface Props {
  name: string;
  avatarUrl?: string | null;
  lang: Lang;
  theme: "dark" | "light";
  accent: string;
}

function TopBarUser({ name, avatarUrl = null, lang, theme, accent }: Props) {
  const [current, setCurrent] = useState({ name, avatarUrl });

  // Migrates once the language/theme/accent that used to live in localStorage.
  useEffect(() => {
    void migrateLegacyPrefs({ lang, theme, accent }).then((langChanged) => {
      if (langChanged) window.location.reload();
    });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUserUpdated = (e: Event) => {
      const user = (e as CustomEvent<Partial<User>>).detail;
      if (!user) return;
      setCurrent((prev) => ({
        name: user.first_name || user.email || prev.name,
        avatarUrl: "avatar" in user ? getMediaUrl(user.avatar) || null : prev.avatarUrl,
      }));
    };
    window.addEventListener("crm:user-updated", onUserUpdated);
    return () => window.removeEventListener("crm:user-updated", onUserUpdated);
  }, []);

  return (
    <>
      <Avatar name={current.name} src={current.avatarUrl} size="sm" />
      <span className="hidden text-sm sm:inline">{current.name}</span>
    </>
  );
}

export default withLang(TopBarUser);
