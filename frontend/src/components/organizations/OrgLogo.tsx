/**
 * OrgLogo — an organization's logo, or initials if it has none (or if loading fails).
 *
 * - md: size-10 rounded-md (cards and rows). Without a logo it uses a square Avatar.
 * - lg: size-16 rounded-lg (detail header).
 * - The logo enters with a 200 ms fade once loaded, over the initials; if it fails,
 *   the initials remain (spec v7 O).
 */
import type { Organization } from "../../types";
import Avatar, { avatarInitials, avatarTone } from "../ui/Avatar";
import { useImageFade } from "../ui/useImageFade";
import { orgLogoUrl } from "./organizationUtils";

interface Props {
  org: Pick<Organization, "name" | "logo" | "updated_at">;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const BOX_CLASS = {
  sm: "size-8 rounded-md",
  md: "size-10 rounded-md",
  lg: "size-16 rounded-lg",
} as const;

export default function OrgLogo({ org, size = "md", className = "" }: Props) {
  const url = orgLogoUrl(org);
  // A new logo (different URL) retries loading: the state resets with `url`.
  const { status, imgProps } = useImageFade(url);
  const showImg = url !== "" && status !== "error";
  const ready = showImg && status === "loaded";

  // Initials always underneath: the logo fades in on top and hides them once loaded.
  const tone = avatarTone(org.name);
  const initials = (
    <span
      aria-hidden="true"
      className={`absolute inset-0 inline-flex select-none items-center justify-center font-medium transition-opacity duration-200 ease-out motion-reduce:transition-none ${size === "lg" ? "text-xl" : size === "md" ? "text-sm" : "text-xs"} ${ready ? "opacity-0" : "opacity-100"}`}
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {avatarInitials(org.name)}
    </span>
  );

  // No logo: same component as before (square Avatar / lg initials), without extra layers.
  if (!showImg) {
    if (size === "lg") {
      return (
        <span
          aria-hidden="true"
          className={`inline-flex size-16 shrink-0 select-none items-center justify-center rounded-lg text-xl font-medium ${className}`}
          style={{ backgroundColor: tone.bg, color: tone.fg }}
        >
          {avatarInitials(org.name)}
        </span>
      );
    }
    return <Avatar name={org.name} size={size} shape="square" className={className} />;
  }

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden bg-muted ${BOX_CLASS[size]} ${className}`}
    >
      {initials}
      <img
        {...imgProps}
        src={url}
        alt=""
        className={`${imgProps.className} absolute inset-0 size-full object-cover`}
      />
    </span>
  );
}
