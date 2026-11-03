/**
 * RemindersBoard — Board view of /reminders/.
 *
 * Three columns (Pending / In progress / Done). Moving cards:
 * - native HTML5 drag and drop (no dependencies);
 * - "Move to ..." menu on each card (accessible and for touch screens).
 *
 * The component does not talk to the API: it notifies via `onMove` and the parent does the
 * optimistic update + PATCH/complete.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapPin, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { PersonListItem, Reminder, ReminderStatus } from "../../types";
import { useTranslation } from "../../i18n";
import { formatDateTime, formatRelative, formatTime } from "../../utils/format";
import Avatar from "../ui/Avatar";
import AiMark from "../ui/AiMark";
import { kindIcon, REMINDER_STATUSES } from "./reminderKind";

/** Maximum number of cards in "Done" (the most recent). */
export const DONE_LIMIT = 20;
const MAX_AVATARS = 3;

interface Props {
  reminders: Reminder[];
  personById: Map<number, PersonListItem>;
  onMove: (reminder: Reminder, status: ReminderStatus) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}

function personName(p: PersonListItem): string {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim();
}

export default function RemindersBoard({ reminders, personById, onMove, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<ReminderStatus | null>(null);

  const columns = useMemo(() => {
    const byDate = (a: Reminder, b: Reminder) =>
      new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime();
    const byRecent = (a: Reminder, b: Reminder) =>
      new Date(b.updated_at ?? b.created_at).getTime() -
      new Date(a.updated_at ?? a.created_at).getTime();
    return {
      todo: reminders.filter((r) => r.status === "todo").sort(byDate),
      in_progress: reminders.filter((r) => r.status === "in_progress").sort(byDate),
      done: reminders.filter((r) => r.status === "done").sort(byRecent).slice(0, DONE_LIMIT),
    } satisfies Record<ReminderStatus, Reminder[]>;
  }, [reminders]);

  const endDrag = () => {
    setDragId(null);
    setOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, status: ReminderStatus) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain")) || dragId;
    endDrag();
    if (id == null) return;
    const r = reminders.find((x) => x.id === id);
    if (r && r.status !== status) onMove(r, status);
  };

  return (
    <div className="flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
      {REMINDER_STATUSES.map((status) => {
        const items = columns[status];
        const highlighted = overCol === status && dragId !== null;
        return (
          <section
            key={status}
            aria-label={t(`enums.reminder.status.${status}`)}
            onDragOver={(e) => {
              if (dragId === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overCol !== status) setOverCol(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverCol((cur) => (cur === status ? null : cur));
              }
            }}
            onDrop={(e) => handleDrop(e, status)}
            className={`min-w-72 shrink-0 snap-start rounded-lg bg-secondary p-2 md:min-w-0 ${
              highlighted ? "ring-2 ring-ring" : ""
            }`}
          >
            <header className="mb-2 flex items-center gap-2 px-1 pt-1">
              <h2 className="text-sm font-semibold">{t(`enums.reminder.status.${status}`)}</h2>
              <span className="text-xs text-fg-muted tabular-nums">{items.length}</span>
            </header>
            <ul className="min-h-16 space-y-2">
              {items.length === 0 && (
                <li className="px-1 py-2 text-xs text-fg-muted">{t("reminder.board.empty")}</li>
              )}
              {items.map((r) => (
                <BoardCard
                  key={r.id}
                  reminder={r}
                  personById={personById}
                  dragging={dragId === r.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(r.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(r.id);
                  }}
                  onDragEnd={endDrag}
                  onMove={onMove}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface CardProps {
  reminder: Reminder;
  personById: Map<number, PersonListItem>;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (reminder: Reminder, status: ReminderStatus) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}

function BoardCard({
  reminder: r,
  personById,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onEdit,
  onDelete,
}: CardProps) {
  const { t, lang } = useTranslation();
  const KindIcon = kindIcon(r.kind);
  const kindLabel = t(`enums.reminder.kind.${r.kind ?? "task"}`);

  // Main person + participants, without duplicates.
  const people = useMemo(() => {
    const list: { id: number; name: string; photo: number | null }[] = [];
    if (r.person != null) {
      const p = personById.get(r.person);
      if (p) list.push({ id: p.id, name: personName(p), photo: p.profile_photo ?? null });
    }
    for (const d of r.participants_detail ?? []) {
      if (!list.some((x) => x.id === d.id)) {
        const p = personById.get(d.id);
        list.push({ id: d.id, name: d.display_name, photo: p?.profile_photo ?? null });
      }
    }
    return list;
  }, [r.person, r.participants_detail, personById]);

  const shown = people.slice(0, MAX_AVATARS);
  const extra = people.length - shown.length;
  const done = r.status === "done";

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`neo-card cursor-grab px-3 py-2.5 active:cursor-grabbing ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <p
          className={`min-w-0 flex-1 break-words text-sm font-medium ${
            done ? "text-fg-muted line-through" : "text-fg"
          }`}
        >
          {r.title}
        </p>
        <CardMenu reminder={r} onMove={onMove} onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5" title={kindLabel}>
          <KindIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{kindLabel}</span>
          <span className="tabular-nums" title={formatDateTime(r.remind_at, lang)}>
            {formatRelative(r.remind_at, lang)} {formatTime(r.remind_at, lang)}
          </span>
        </span>
        {r.kind === "meeting" && r.location && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{r.location}</span>
          </span>
        )}
        <AiMark createdVia={r.created_via} />
      </div>

      {people.length > 0 && (
        <div
          className="mt-2 flex items-center"
          title={people.map((p) => p.name).join(", ")}
        >
          <div className="flex -space-x-2">
            {shown.map((p) => (
              <Avatar
                key={p.id}
                name={p.name}
                photoId={p.photo}
                size="xs"
                className="ring-2 ring-surface"
              />
            ))}
          </div>
          {extra > 0 && (
            <span className="ml-1.5 text-xs text-fg-muted tabular-nums">+{extra}</span>
          )}
          <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
        </div>
      )}
    </li>
  );
}

/**
 * Card menu: "Move to ..." with the other two columns (and edit /
 * delete). Positioned with `fixed` so the board's horizontal scroll
 * on mobile does not clip it.
 */
function CardMenu({
  reminder: r,
  onMove,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  onMove: (reminder: Reminder, status: ReminderStatus) => void;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const targets = REMINDER_STATUSES.filter((s) => s !== r.status);
  const label = t("reminder.board.more_actions");
  const itemClass =
    "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-icon -my-1 -mr-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="neo-card z-50 min-w-48 rounded-md p-1 shadow-lg"
        >
          {targets.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                onMove(r, s);
              }}
            >
              {t("reminder.board.move_to", { column: t(`enums.reminder.status.${s}`) })}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onEdit(r);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {t("common.edit")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} hover:bg-status-overdue hover:text-accent`}
            onClick={() => {
              setOpen(false);
              onDelete(r);
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t("common.delete")}
          </button>
        </div>
      )}
    </>
  );
}
