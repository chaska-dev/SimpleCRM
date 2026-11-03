/**
 * EmptyState — centered empty state inside a card (spec 6.7).
 * Size-8 icon in a size-12 circle, title, one help line and at most
 * one button (pass `action` already rendered, with class `neo-btn neo-btn-sm`).
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-6 text-center ${className}`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-8 text-fg-muted" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
