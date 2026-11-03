/**
 * PendingRemindersCard — to-do reminders (todo / in progress) on the home page.
 *
 * - Come from the backend sorted by date: overdue first ("Overdue" mark).
 * - Check to complete: the parent does it optimistically.
 * - From `lg` it takes the calendar's height (the card is positioned absolutely
 *   inside its container) and the list scrolls internally if it does not fit.
 * - No pending items: empty state with a "New reminder" button.
 */
import { Bell, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { Reminder } from "../../types";
import { formatDateTime, formatRelative, formatTime } from "../../utils/format";
import { kindIcon } from "../reminders/reminderKind";
import AiMark from "../ui/AiMark";
import EmptyState from "../ui/EmptyState";
import { isReminderOverdue } from "./dashboard-data";

interface Props {
  reminders: Reminder[];
  onComplete: (reminder: Reminder) => void;
  /** Ids of reminders with a complete request in progress. */
  busyIds: ReadonlySet<number>;
}

export default function PendingRemindersCard({ reminders, onComplete, busyIds }: Props) {
  const { t, lang } = useTranslation();
  const title = t("dashboard.pending_title");
  const now = Date.now();

  return (
    <section
      aria-label={title}
      className="neo-card flex flex-col overflow-hidden lg:absolute lg:inset-0"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {reminders.length > 0 && (
          <a href="/reminders/" className="text-sm font-medium text-primary no-underline hover:underline">
            {t("dashboard.pending_view_all")}
          </a>
        )}
      </header>

      {reminders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center border-t border-border">
          <EmptyState
            icon={Bell}
            title={t("dashboard.pending_empty")}
            description={t("dashboard.pending_empty_hint")}
            action={
              <a href="/reminders/?new=1" className="neo-btn neo-btn-sm no-underline">
                {t("reminder.add")}
              </a>
            }
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
          {reminders.map((r) => {
            const KindIcon = kindIcon(r.kind);
            const overdue = isReminderOverdue(r, now);
            const busy = busyIds.has(r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => onComplete(r)}
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={`${t("dashboard.pending_complete")}: ${r.title}`}
                  title={t("dashboard.pending_complete")}
                  className="btn-icon"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium" title={r.title}>
                    {r.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    <span
                      className="inline-flex items-center gap-1.5 tabular-nums"
                      title={formatDateTime(r.remind_at, lang)}
                    >
                      <KindIcon
                        className="size-3.5"
                        role="img"
                        aria-label={t(`enums.reminder.kind.${r.kind ?? "task"}`)}
                      />
                      {formatRelative(r.remind_at, lang)} {formatTime(r.remind_at, lang)}
                    </span>
                    {overdue && (
                      <span className="font-medium text-status-overdue-fg">
                        {t("dashboard.pending_overdue")}
                      </span>
                    )}
                    <AiMark createdVia={r.created_via} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
