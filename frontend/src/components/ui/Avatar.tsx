/**
 * Avatar — the app's single avatar component.
 *
 * - If `photoId` is truthy, it requests `/api/attachments/{id}/thumb/`; if that fails (or there
 *   is no photo) it shows initials over one of the 6 neutral tones (avatarTone).
 *   At `lg` it requests `anim=1` so animated GIF/WEBP files play animated.
 * - If it receives `src` (a direct URL, e.g. the user's photo) it shows it with
 *   `object-cover`; it takes priority over `photoId`. If the image fails, it falls back to
 *   the initials.
 * - The photo fades in over 200 ms once loaded, over the initials
 *   (which fade out); with prefers-reduced-motion it changes without a transition.
 * - Sizes: xs = size-6 (boards, overlapping stacks), sm = size-8 (rows),
 *   md = size-10 (cards), lg = size-16 (header).
 * - `shape="square"` (rounded-md) is used for organizations; by default it is
 *   circular (people).
 */
import { useImageFade } from "./useImageFade";

/*
 * Tone and initials helpers live next to the component (a single Avatar in the
 * app). The 6 bg/fg pairs are in global.css as --avatar-{1..6}-bg/-fg
 * (light and dark). The brand accent is NOT used in avatars.
 * Note: there is no separate avatar.ts because on Windows "Avatar" and "avatar"
 * collide in module resolution.
 */
export interface AvatarTone {
  /** Index 1..6 of the color pair. */
  index: number;
  bg: string;
  fg: string;
}

/** Sum of the name's char codes, modulo 6 (+1). */
export function avatarTone(name: string | null | undefined): AvatarTone {
  const text = (name ?? "").trim();
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i);
  const index = (sum % 6) + 1;
  return {
    index,
    bg: `var(--avatar-${index}-bg)`,
    fg: `var(--avatar-${index}-fg)`,
  };
}

/** Initials (max 2) from the visible name. */
export function avatarInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const second = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + second).toUpperCase();
}

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarShape = "circle" | "square";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "size-6 text-xs",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
};

const THUMB_PX: Record<AvatarSize, number> = { xs: 48, sm: 64, md: 96, lg: 160 };

interface Props {
  /** Visible name: determines the tone and the initials. */
  name: string;
  /** ID of the profile photo attachment. Falsy = no photo. */
  photoId?: number | string | null;
  /** Direct image URL (the user's photo). Falsy = use photoId/initials. */
  src?: string | null;
  size?: AvatarSize;
  shape?: AvatarShape;
  className?: string;
}

export default function Avatar({
  name,
  photoId,
  src,
  size = "sm",
  shape = "circle",
  className = "",
}: Props) {
  const imgSrc = src
    ? src
    : photoId
      ? `/api/attachments/${photoId}/thumb/?w=${THUMB_PX[size]}&h=${THUMB_PX[size]}${size === "lg" ? "&anim=1" : ""}`
      : "";
  // Changing the source resets the state ("loading"), so a new `src` retries after a failure.
  const { status, imgProps } = useImageFade(imgSrc);
  const showPhoto = imgSrc !== "" && status !== "error";
  const photoReady = showPhoto && status === "loaded";
  const tone = avatarTone(name);

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden ${shape === "square" ? "rounded-md" : "rounded-full"} font-medium ${SIZE_CLASS[size]} ${className}`}
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      <span
        className={`transition-opacity duration-200 ease-out motion-reduce:transition-none ${photoReady ? "opacity-0" : "opacity-100"}`}
      >
        {avatarInitials(name)}
      </span>
      {showPhoto && (
        <img
          {...imgProps}
          src={imgSrc}
          alt=""
          className={`${imgProps.className} absolute inset-0 block size-full object-cover`}
        />
      )}
    </span>
  );
}
