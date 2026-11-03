/**
 * Logo — brand symbol (closeness rings) inline, with
 * `fill="currentColor"`: it inherits the text color, so `text-primary`
 * tints it with the user's accent.
 *
 * In the interface the small crop is ALWAYS used (one ring + core), at all
 * sizes and screens (sidebar, login, register, welcome, 404, Brand): it is
 * the same drawing as the favicon. The full symbol (two rings + core) is kept
 * only for documentation and large materials.
 * There is no wordmark here: the app name is user-editable text.
 */

const SYMBOL_SMALL_PATH =
  "M8 128 A120 120 0 0 1 248 128 A120 120 0 0 1 8 128 Z M40 128 A88 88 0 0 0 216 128 A88 88 0 0 0 40 128 Z M74 194 A54 54 0 0 1 182 194 A54 54 0 0 1 74 194 Z";

interface Props {
  /** Side in px (the symbol is square). Defaults to 24. */
  size?: number;
  className?: string;
  /** Accessible name; without it, the logo is decorative (aria-hidden). */
  title?: string;
}

export default function Logo({ size = 24, className = "text-primary", title }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path fill="currentColor" d={SYMBOL_SMALL_PATH} />
    </svg>
  );
}
