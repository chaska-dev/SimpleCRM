/**
 * Skeleton — primitives for loading placeholders.
 *
 * Solid rounded blocks, no shadows or blur. The animation is a soft pulse over `bg-muted` (theme
 * token), so there is no need to hardcode a color and it respects light/dark.
 *
 * For accessibility:
 *   - `animate-pulse` is disabled with `prefers-reduced-motion: reduce`
 *     (rule in `src/styles/skeleton.css`).
 *   - Each block is `aria-hidden="true"`. The parent container must have
 *     `role="status"` + a visible/sr-only label so screen readers
 *     announce "loading".
 *
 * Typical usage:
 *   <div role="status" aria-live="polite">
 *     <span className="sr-only">{t("common.loading")}</span>
 *     <PersonCardSkeleton />
 *   </div>
 *
 * Or use the `SkeletonGroup` helper which already wraps with role+sr-only.
 */
import type { CSSProperties, ReactNode } from "react";

export interface SkeletonProps {
  /** Extra classes (size, margin, etc.). Base styling is already applied. */
  className?: string;
  style?: CSSProperties;
  /** Override of the ARIA role. Default "status". Pass `false` to emit no role. */
  role?: "status" | undefined;
  /** `aria-live` for the container. Default "polite". */
  ariaLive?: "polite" | "assertive" | "off";
}

const BASE =
  "relative block rounded-md bg-muted animate-pulse select-none";

/**
 * Generic rectangular block. Useful for bars, full cards, headers.
 * Pass it a tailwind `className` to set the size (h-X w-full, etc.).
 */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[BASE, className].join(" ").trim()}
      style={style}
    />
  );
}

/** Block with fixed height and width — shortcut for square placeholders. */
export function SkeletonBlock({
  size = "1rem",
  className = "",
}: {
  size?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Paragraph of lines — imitates a text block with N lines.
 * The last line can be shorter (`lastWidth`).
 */
export function SkeletonText({
  lines = 3,
  lastWidth = "60%",
  gap = "0.5rem",
  className = "",
}: {
  lines?: number;
  /** Width of the last line (0-100%). Default 60% — gives it a paragraph shape. */
  lastWidth?: string;
  gap?: string;
  className?: string;
}) {
  const safeLines = Math.max(1, lines);
  const items: ReactNode[] = [];
  for (let i = 0; i < safeLines; i++) {
    const isLast = i === safeLines - 1;
    items.push(
      <Skeleton
        key={i}
        className="h-3"
        style={{ width: isLast ? lastWidth : "100%" }}
      />,
    );
  }
  return (
    <div
      aria-hidden="true"
      className={["flex flex-col", className].join(" ").trim()}
      style={{ gap }}
    >
      {items}
    </div>
  );
}

/**
 * Circle (avatar, icons, etc.). Defaults to 48×48.
 */
export function SkeletonCircle({
  size = "3rem",
  className = "",
}: {
  size?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={["!rounded-full shrink-0", className].join(" ").trim()}
      style={{ width: size, height: size, borderRadius: "9999px" }}
    />
  );
}

/**
 * Wrapper with `role="status"` + sr-only label so screen readers
 * announce the loading state. Wraps several Skeleton* and presents them as
 * a single "loading place".
 *
 * Usage:
 *   <SkeletonGroup label={t("common.loading")}>
 *     <PersonCardSkeleton />
 *     <PersonCardSkeleton />
 *   </SkeletonGroup>
 */
export function SkeletonGroup({
  label,
  children,
  ariaLive = "polite",
  className = "",
}: {
  /** Text announced while loading (e.g. `t("common.loading")`). */
  label: string;
  children: ReactNode;
  ariaLive?: "polite" | "assertive" | "off";
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live={ariaLive}
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
