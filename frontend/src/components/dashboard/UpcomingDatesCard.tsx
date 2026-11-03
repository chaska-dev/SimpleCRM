/**
 * UpcomingDatesCard — birthdays and important dates for the next 30 days.
 *
 * Each row: avatar, name (link to the person), what it is ("Turns 27" or the date's
 * title) and "in N days". The backend delivers at most 6.
 */
import { Calendar } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ImportantDate, PersonListItem } from "../../types";
import { importantDateTitle } from "../persons/detail/helpers";
import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";

type EventWithPerson = ImportantDate & { person: PersonListItem };

interface Props {
  events: EventWithPerson[];
}

function personName(p: PersonListItem): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "?";
}

/** Age reached on the next occurrence (the backend calculates with the current year). */
function turningAge(ev: ImportantDate): number | null {
  if (ev.kind !== "birthday" || ev.birth_year === null || ev.birth_year === undefined) return null;
  const next = new Date();
  next.setDate(next.getDate() + (ev.days_until_next ?? 0));
  return next.getFullYear() - ev.birth_year;
}

export default function UpcomingDatesCard({ events }: Props) {
  const { t } = useTranslation();
  const title = t("dashboard.upcoming_title");

  if (events.length === 0) {
    return (
      <section aria-label={title} className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <EmptyState
          icon={Calendar}
          title={t("dashboard.upcoming_empty")}
          description={t("dashboard.upcoming_empty_hint")}
        />
      </section>
    );
  }

  return (
    <section aria-label={title} className="neo-card overflow-hidden">
      <h2 className="px-4 py-3 text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border border-t border-border">
        {events.map((ev) => {
          const name = personName(ev.person);
          const age = turningAge(ev);
          const what =
            age !== null ? t("dashboard.birthday_age", { age }) : importantDateTitle(t, ev);
          const days = ev.days_until_next;
          const href = `/persons/${ev.person.id}/`;
          return (
            <li key={ev.id} className="flex items-center gap-3 px-4 py-3">
              <a href={href} tabIndex={-1} aria-label={name} className="shrink-0 no-underline">
                <Avatar name={name} photoId={ev.person.profile_photo} size="sm" />
              </a>
              <div className="min-w-0 flex-1">
                <a
                  href={href}
                  title={name}
                  className="line-clamp-2 break-words text-sm font-medium text-fg no-underline hover:underline"
                >
                  {name}
                </a>
                <p className="truncate text-xs text-fg-muted">{what}</p>
              </div>
              {days !== null && days !== undefined && (
                <span className="shrink-0 whitespace-nowrap text-xs text-fg-muted tabular-nums">
                  {days === 0 ? t("common.today") : t("dashboard.in_days", { count: days })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
