/**
 * Tabs — sections of a page (Settings, person detail).
 *
 * Row with a bottom border; the active tab has a 2px `primary` border that
 * covers the row's border. No background.
 */
import type { ReactNode } from "react";

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
}

interface Props<K extends string> {
  tabs: ReadonlyArray<TabItem<K>>;
  active: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
  /** Prefix for ids (`${idPrefix}-tab-${key}`) linkable with aria-controls. */
  idPrefix?: string;
  className?: string;
}

export default function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  idPrefix = "tabs",
  className = "",
}: Props<K>) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.key === active);
    const next = e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    document.getElementById(`${idPrefix}-tab-${tabs[next].key}`)?.focus();
  };

  return (
    <div className={`border-b border-border ${className}`}>
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="-mb-px flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`mr-6 h-10 shrink-0 whitespace-nowrap border-b-2 px-1 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? "border-primary text-fg"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
    </div>
  );
}
