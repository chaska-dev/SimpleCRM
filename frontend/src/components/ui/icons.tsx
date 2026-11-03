/**
 * Single map of keys → lucide icons + `<IconByKey />` component.
 *
 * Replaces the emojis that used to be used as icons. The keys in
 * `DATE_ICON_KEYS` are what gets stored in `ImportantDate.icon`
 * (CharField max_length=8), which is why they are short.
 */

import {
  AlertCircle,
  AlertTriangle,
  AtSign,
  Baby,
  Bell,
  Briefcase,
  Cake,
  Calendar,
  Camera,
  CheckCircle2,
  File,
  FileText,
  Film,
  Folder,
  Gamepad2,
  Gem,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Image,
  Info,
  Link2,
  MessageCircle,
  Mail,
  Music,
  Package,
  PartyPopper,
  Phone,
  Plane,
  Repeat,
  Send,
  Smartphone,
  Star,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

/** Valid keys for an important date's icon (max 8 characters). */
export const DATE_ICON_KEYS = [
  "calendar",
  "cake",
  "heart",
  "gift",
  "star",
  "party",
  "home",
  "travel",
  "work",
  "grad",
  "baby",
  "gem",
] as const;

export type DateIconKey = (typeof DATE_ICON_KEYS)[number];

export const DEFAULT_DATE_ICON: DateIconKey = "calendar";

export const ICONS = {
  // Important dates
  calendar: Calendar,
  cake: Cake,
  heart: Heart,
  gift: Gift,
  star: Star,
  party: PartyPopper,
  home: Home,
  travel: Plane,
  work: Briefcase,
  grad: GraduationCap,
  baby: Baby,
  gem: Gem,

  // Contact types (the keys match `ContactType.key`)
  personal_phone: Smartphone,
  personal_email: Mail,
  work_phone: Phone,
  work_email: Mail,
  whatsapp: MessageCircle,
  telegram: Send,
  instagram: Camera,
  facebook: Globe,
  x: AtSign,
  linkedin: Briefcase,
  discord: Gamepad2,
  other: Link2,

  // Attachments by MIME type
  "file-image": Image,
  "file-video": Film,
  "file-audio": Music,
  "file-pdf": FileText,
  "file-archive": Package,
  "file-text": FileText,
  "file-other": File,
  folder: Folder,

  // Note types
  "note-general": StickyNote,
  "note-followup": Repeat,
  "note-gift": Gift,
  "note-important": Star,

  // Toasts
  "toast-success": CheckCircle2,
  "toast-error": AlertCircle,
  "toast-info": Info,
  "toast-warning": AlertTriangle,

  // Misc
  bell: Bell,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

/** Normalizes the value stored in `ImportantDate.icon`: if it is not a known
 *  key (e.g. an old emoji) it returns `calendar`. */
export function resolveDateIconKey(value: string | null | undefined): DateIconKey {
  return (DATE_ICON_KEYS as readonly string[]).includes(value ?? "")
    ? (value as DateIconKey)
    : DEFAULT_DATE_ICON;
}

interface IconByKeyProps {
  name: string | null | undefined;
  /** Key to use when `name` is not in the map. */
  fallback?: IconKey;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}

/** Renders the lucide icon associated with `name`. Default size `size-4`. */
export function IconByKey({
  name,
  fallback = "calendar",
  className = "size-4",
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
}: IconByKeyProps) {
  const key = (name ?? "") as string;
  const Icon: LucideIcon = Object.prototype.hasOwnProperty.call(ICONS, key)
    ? ICONS[key as IconKey]
    : ICONS[fallback];
  return (
    <Icon
      className={className}
      aria-hidden={ariaLabel ? undefined : (ariaHidden ?? "true")}
      aria-label={ariaLabel}
    />
  );
}
