/**
 * TagPill — neutral pill with a dot in the tag's color (spec 5).
 * The color comes from the DB, so it is applied inline only to the dot.
 * No "#" before the name and no saturated background.
 */
interface Props {
  name: string;
  color?: string | null;
  className?: string;
}

export default function TagPill({ name, color, className = "" }: Props) {
  return (
    <span
      title={name}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-fg ${className}`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color || "var(--color-fg-muted)" }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
