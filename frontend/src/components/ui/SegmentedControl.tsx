/**
 * SegmentedControl — mutually exclusive filters (Pending / Completed / All).
 * Never breaks the text onto two lines.
 */
import type { ReactNode } from "react";

export interface SegmentOption<K extends string = string> {
  key: K;
  label: ReactNode;
}

interface Props<K extends string> {
  options: ReadonlyArray<SegmentOption<K>>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  className?: string;
}

export default function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: Props<K>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex shrink-0 rounded-md bg-muted p-0.5 ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.key)}
            className={`h-7 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
