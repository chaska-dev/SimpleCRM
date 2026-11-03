/**
 * CalendarCard — monthly grid with a dot on days that have events.
 *
 * - Shows the current month and marks days that have an ImportantDate with a dot.
 * - Clicking a day with events opens an inline panel with the list.
 * - Supports prev/next month navigation (internal state).
 *
 * Important: ImportantDate.date is YYYY-MM-DD (no time). Dates with
 * recurrence "yearly" fall on the same month and day every year; the rest only on
 * their original date.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ImportantDate } from "../../types";
import { IconByKey } from "../ui/icons";
import { importantDateTitle } from "../persons/detail/helpers";
import { formatDate, formatMonthName } from "../../utils/format";

interface Props {
  /** ImportantDate within the calendar range (default 60 days from the backend). */
  events: ImportantDate[];
  /** Initial year/month. Default: the current month. */
  initialMonth?: { year: number; month: number }; // month = 0-11
}

interface DayCell {
  date: Date;
  iso: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
  events: ImportantDate[];
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Does the event fall on day `d`? ev.date is YYYY-MM-DD; compared by parts
 * (without going through Date/UTC) to avoid the classic off-by-one.
 * With recurrence "yearly" (or birthday) the month and day match in any year;
 * without recurrence, the full date must match.
 */
function eventFallsOn(ev: ImportantDate & { recurrence?: string }, d: Date): boolean {
  const parts = (ev.date ?? "").split("-");
  if (parts.length !== 3) return false;
  const [yy, mm, dd] = parts.map(Number);
  if (!Number.isFinite(mm) || !Number.isFinite(dd)) return false;
  if (mm !== d.getMonth() + 1 || dd !== d.getDate()) return false;
  const yearly = ev.recurrence === undefined || ev.recurrence === "yearly" || ev.kind === "birthday";
  return yearly || yy === d.getFullYear();
}

export default function CalendarCard({ events, initialMonth }: Props) {
  const { t, lang } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    initialMonth ?? { year: today.getFullYear(), month: today.getMonth() },
  );
  const [openDayIso, setOpenDayIso] = useState<string | null>(null);

  // Monday-first initials from i18n (in Spanish, Wednesday is "X").
  const weekdayLabels = useMemo(() => t("dashboard.weekday_initials").split(","), [t]);

  // Build the month grid (6 rows × 7 columns = 42 cells, starting
  // on Monday for consistency with the Latin/European calendar).
  const grid = useMemo<DayCell[]>(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1);
    // weekday: 0=Sun, 1=Mon, ..., 6=Sat. We want Mon=0.
    const weekdayMon0 = (firstOfMonth.getDay() + 6) % 7;
    const start = new Date(cursor.year, cursor.month, 1 - weekdayMon0);
    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({
        date: d,
        iso: toIso(d),
        inMonth: d.getMonth() === cursor.month,
        isToday: sameDay(d, today),
        events: events.filter((ev) => eventFallsOn(ev, d)),
      });
    }
    return cells;
  }, [cursor, events, today]);

  const monthLabel = `${formatMonthName(cursor.month, lang)} ${cursor.year}`;
  const totalEventsThisMonth = grid
    .filter((c) => c.inMonth)
    .reduce((acc, c) => acc + c.events.length, 0);

  const goPrev = () => {
    setCursor((cur) => {
      const m = cur.month - 1;
      if (m < 0) return { year: cur.year - 1, month: 11 };
      return { year: cur.year, month: m };
    });
    setOpenDayIso(null);
  };
  const goNext = () => {
    setCursor((cur) => {
      const m = cur.month + 1;
      if (m > 11) return { year: cur.year + 1, month: 0 };
      return { year: cur.year, month: m };
    });
    setOpenDayIso(null);
  };
  const goToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setOpenDayIso(null);
  };

  const openDay = grid.find((c) => c.iso === openDayIso);

  return (
    <section aria-label={t("dashboard.calendar_title")} className="neo-card space-y-4 p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{monthLabel}</h2>
          <p className="mt-1 text-xs text-fg-muted tabular-nums">
            {totalEventsThisMonth > 0
              ? t("dashboard.calendar_event_count", { count: totalEventsThisMonth })
              : t("dashboard.calendar_empty")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label={t("dashboard.calendar_prev")}
            title={t("dashboard.calendar_prev")}
            className="btn-icon"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={goToday} className="neo-btn neo-btn-sm neo-btn-ghost">
            {t("dashboard.calendar_today")}
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={t("dashboard.calendar_next")}
            title={t("dashboard.calendar_next")}
            className="btn-icon"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div>
        {/* Weekday header */}
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-fg-muted">
          {weekdayLabels.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell) => {
            const isOpen = cell.iso === openDayIso;
            const hasEvents = cell.events.length > 0;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => {
                  if (!hasEvents) return;
                  setOpenDayIso((cur) => (cur === cell.iso ? null : cell.iso));
                }}
                tabIndex={hasEvents ? 0 : -1}
                aria-label={
                  hasEvents
                    ? `${formatDate(cell.iso, lang)}, ${cell.events.map((e) => importantDateTitle(t, e)).join(", ")}`
                    : formatDate(cell.iso, lang)
                }
                aria-pressed={hasEvents ? isOpen : undefined}
                className={[
                  "relative h-9 rounded-md text-sm tabular-nums transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !cell.inMonth ? "text-fg-muted opacity-50" : "",
                  cell.isToday ? "font-semibold text-primary" : "",
                  hasEvents ? "cursor-pointer" : "cursor-default",
                  isOpen ? "bg-primary-soft text-primary-soft-fg" : "",
                ].join(" ")}
              >
                {cell.date.getDate()}
                {hasEvents && (
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${
                      cell.isToday ? "bg-primary" : "bg-fg-muted"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day-detail panel */}
      {openDay && openDay.events.length > 0 && (
        <div className="space-y-2 rounded-md bg-muted px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg-muted tabular-nums">
              {formatDate(openDay.iso, lang)}
            </span>
            <button
              type="button"
              onClick={() => setOpenDayIso(null)}
              className="btn-icon -mr-2"
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-2">
            {openDay.events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 text-sm">
                <IconByKey
                  name={ev.kind === "birthday" ? "cake" : "calendar"}
                  className="size-4 shrink-0 text-fg-muted"
                />
                <a
                  href={`/persons/${ev.person}/#dates`}
                  className="truncate font-medium no-underline hover:underline"
                >
                  {importantDateTitle(t, ev)}
                </a>
                {ev.days_until_next !== null && ev.days_until_next !== undefined && (
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                    {ev.days_until_next === 0
                      ? t("common.today")
                      : t("dashboard.days_until", { n: ev.days_until_next })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
