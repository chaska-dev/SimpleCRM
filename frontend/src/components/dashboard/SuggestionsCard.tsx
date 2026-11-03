/**
 * SuggestionsCard — who is worth contacting, with the reason as meta text.
 *
 * Rows arrive already sorted by priority from the backend (overdue cadence,
 * about to be due, frequently contacted, never contacted). The
 * "Mark contacted" action is resolved optimistically by the parent.
 */
import { Check, Loader2, MessageSquarePlus } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { DashboardSuggestion, PersonListItem } from "../../types";
import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";

interface Props {
  suggestions: DashboardSuggestion[];
  onMarkContacted: (person: PersonListItem) => void;
  /** Id of the person with "mark contacted" in progress. */
  busyId: number | null;
}

function personName(p: PersonListItem): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.nick_name || "?";
}

const REASON_TONE: Record<DashboardSuggestion["reason"], string> = {
  overdue: "text-status-overdue-fg",
  due_soon: "text-status-due-soon-fg",
  frequent: "text-fg-muted",
  never_contacted: "text-fg-muted",
};

export default function SuggestionsCard({ suggestions, onMarkContacted, busyId }: Props) {
  const { t } = useTranslation();
  const title = t("dashboard.suggestions_title");

  const reasonText = (s: DashboardSuggestion): string => {
    switch (s.reason) {
      case "overdue":
        return t("dashboard.suggestion_overdue", { count: s.days ?? 1 });
      case "due_soon":
        return t("dashboard.suggestion_due_soon");
      case "frequent":
        return t("dashboard.suggestion_frequent");
      default:
        return t("dashboard.suggestion_never");
    }
  };

  if (suggestions.length === 0) {
    return (
      <section aria-label={title} className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <EmptyState
          icon={MessageSquarePlus}
          title={t("dashboard.suggestions_empty")}
          description={t("dashboard.suggestions_empty_hint")}
        />
      </section>
    );
  }

  return (
    <section aria-label={title} className="neo-card overflow-hidden">
      <h2 className="px-4 py-3 text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border border-t border-border">
        {suggestions.map((s) => {
          const name = personName(s.person);
          const busy = busyId === s.person.id;
          const href = `/persons/${s.person.id}/`;
          return (
            <li key={s.person.id} className="flex items-center gap-3 px-4 py-3">
              <a href={href} tabIndex={-1} aria-label={name} className="shrink-0 no-underline">
                <Avatar name={name} photoId={s.person.profile_photo} size="sm" />
              </a>
              <div className="min-w-0 flex-1">
                <a
                  href={href}
                  title={name}
                  className="line-clamp-2 break-words text-sm font-medium text-fg no-underline hover:underline"
                >
                  {name}
                </a>
                <p className={`truncate text-xs ${REASON_TONE[s.reason]}`}>{reasonText(s)}</p>
              </div>
              <button
                type="button"
                onClick={() => onMarkContacted(s.person)}
                disabled={busy}
                aria-busy={busy}
                className="btn-icon"
                title={t("person.mark_contacted_today")}
                aria-label={`${t("person.mark_contacted_today")}: ${name}`}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-4" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
