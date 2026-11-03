/**
 * ReminderRow — a reminder's row in the list.
 *
 * Goes inside a card with divided rows (`divide-y divide-border`), it is not
 * a card itself. Renders title, relative date (absolute in `title`),
 * type icon, location (meetings), recurrence as meta text (nothing if
 * "none") and person link.
 * Actions: check (complete), edit and delete as `.btn-icon`.
 */

import { Circle, CheckCircle2, MapPin, Pencil, Repeat, Trash2, User } from "lucide-react";
import type { Lang, PersonListItem, Reminder, Recurrence } from "../../types";
import { useTranslation } from "../../i18n";
import { dayDiff, formatDate, formatDateTime, formatTime } from "../../utils/format";
import { kindIcon } from "./reminderKind";
import AiMark from "../ui/AiMark";

interface ReminderRowProps {
  reminder: Reminder;
  /** Lookup map to resolve person name by id. */
  personById: Map<number, PersonListItem>;
  onComplete: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}

interface RelativeParts {
  prefix: string; // e.g. "Today" / "in 3 days"
  time: string; // e.g. "14:30"
}

/** Returns the relative date part (Today/Tomorrow/Yesterday/in N days/N days ago) + time. */
function relativeAndTime(
  iso: string,
  lang: Lang,
  t: (k: string, v?: Record<string, string | number>) => string,
): RelativeParts {
  const time = formatTime(iso, lang);
  const days = dayDiff(iso);
  if (days === null) return { prefix: "", time };
  if (days === 0) return { prefix: t("reminder.relative.today"), time };
  if (days === 1) return { prefix: t("reminder.relative.tomorrow"), time };
  if (days === -1) return { prefix: t("reminder.relative.yesterday"), time };
  if (days > 0 && days <= 30) return { prefix: t("reminder.relative.in_days", { n: days }), time };
  if (days < 0 && days >= -30) return { prefix: t("reminder.relative.days_ago", { n: -days }), time };
  // Fallback: absolute date.
  return { prefix: formatDate(iso, lang), time };
}

function fullName(p: PersonListItem): string {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim();
}

export default function ReminderRow({
  reminder,
  personById,
  onComplete,
  onEdit,
  onDelete,
}: ReminderRowProps) {
  const { lang, t } = useTranslation();
  const recurKey = `enums.reminder.recurrence.${reminder.recur as Recurrence}`;
  const person = reminder.person == null ? null : personById.get(reminder.person) ?? null;
  const { prefix, time } = relativeAndTime(reminder.remind_at, lang, t);
  const KindIcon = kindIcon(reminder.kind);
  const kindLabel = t(`enums.reminder.kind.${reminder.kind ?? "task"}`);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Check / complete */}
      <button
        type="button"
        onClick={() => onComplete(reminder)}
        disabled={reminder.completed}
        aria-label={t("reminder.completed_toast")}
        title={t("reminder.completed_toast")}
        className={[
          "btn-icon",
          reminder.completed ? "cursor-default text-status-ok-fg hover:bg-transparent hover:text-status-ok-fg" : "",
        ].join(" ")}
      >
        {reminder.completed ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : (
          <Circle className="size-4" aria-hidden="true" />
        )}
      </button>

      {/* Content: title + meta */}
      <div className="min-w-0 flex-1">
        <p
          className={[
            "truncate text-sm font-medium",
            reminder.completed ? "text-fg-muted line-through" : "text-fg",
          ].join(" ")}
        >
          {reminder.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          <span
            className="inline-flex items-center gap-1.5 tabular-nums"
            title={formatDateTime(reminder.remind_at, lang)}
          >
            <KindIcon className="size-3.5" aria-label={kindLabel} role="img" />
            {prefix} {time}
          </span>
          {reminder.kind === "meeting" && reminder.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {reminder.location}
            </span>
          )}
          <AiMark createdVia={reminder.created_via} />
          {reminder.recur !== "none" && (
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="size-3.5" aria-hidden="true" />
              {t(recurKey)}
            </span>
          )}
          {person && (
            <a
              href={`/persons/${person.id}/`}
              className="inline-flex items-center gap-1.5 text-fg no-underline hover:text-primary hover:underline"
            >
              <User className="size-3.5" aria-hidden="true" />
              {fullName(person)}
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(reminder)}
          disabled={reminder.completed}
          aria-label={t("common.edit")}
          title={t("common.edit")}
          className="btn-icon"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(reminder)}
          aria-label={t("common.delete")}
          title={t("common.delete")}
          className="btn-icon btn-icon-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
