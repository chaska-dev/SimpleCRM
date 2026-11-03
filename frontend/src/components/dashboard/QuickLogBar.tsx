/**
 * QuickLogBar — input that filters people by name and opens the modal.
 *
 * Case-insensitive match on first_name + last_name + nick_name
 * + company. If the query has < 2 chars, it shows no suggestions.
 */
import { useMemo, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { PersonListItem } from "../../types";
import Avatar from "../ui/Avatar";

interface Props {
  people: PersonListItem[];
  onSelect: (p: PersonListItem) => void;
}

function matches(p: PersonListItem, q: string): boolean {
  const haystack = `${p.first_name} ${p.last_name} ${p.nick_name} ${p.company}`.toLowerCase();
  return haystack.includes(q);
}

function fullName(p: PersonListItem): string {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim() || "?";
}

export default function QuickLogBar({ people, onSelect }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return people.filter((p) => matches(p, q)).slice(0, 8);
  }, [people, query]);

  const showResults = query.trim().length >= 2 && results.length > 0;

  return (
    <div className="relative">
      <label htmlFor="quick-log-input" className="sr-only">
        {t("dashboard.quick_log_placeholder")}
      </label>
      <MessageSquarePlus
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
        aria-hidden="true"
      />
      <input
        id="quick-log-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("dashboard.quick_log_placeholder")}
        className="neo-input pl-9 pr-10"
      />
      {query.length > 0 && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="btn-icon absolute right-0.5 top-0.5"
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}

      {showResults && (
        <ul
          className="neo-card absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-auto p-2 shadow-lg"
          role="listbox"
        >
          {results.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <Avatar name={fullName(p)} photoId={p.profile_photo} size="sm" />
                <span className="truncate font-medium">{fullName(p)}</span>
                <span className="truncate text-xs text-fg-muted">
                  {[p.nick_name, p.company].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 px-1 text-xs text-fg-muted">{t("common.no_results")}</p>
      )}
    </div>
  );
}
