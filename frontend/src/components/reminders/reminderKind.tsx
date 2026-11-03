/**
 * Icons and order of reminder type/status, shared by the list,
 * the board and the form.
 */
import { Cake, Circle, CheckSquare, Phone, Users, type LucideIcon } from "lucide-react";
import type { ReminderKind, ReminderStatus } from "../../types";

export const REMINDER_KINDS: ReminderKind[] = ["task", "call", "meeting", "birthday", "other"];

export const REMINDER_STATUSES: ReminderStatus[] = ["todo", "in_progress", "done"];

const KIND_ICON: Record<ReminderKind, LucideIcon> = {
  task: CheckSquare,
  call: Phone,
  meeting: Users,
  birthday: Cake,
  other: Circle,
};

export function kindIcon(kind: ReminderKind | undefined): LucideIcon {
  return KIND_ICON[kind ?? "task"] ?? Circle;
}
