/**
 * PersonCard — view of a PersonListItem.
 *
 * - variant "grid": full card (Avatar md, meta, tags, cadence status).
 * - variant "row": dense row WITHOUT its own card; the parent puts it inside a
 *   card with `divide-y divide-border` (see PersonsListView / FavoritePeopleCard).
 *   With `compact` (narrow columns, e.g. dashboard Favorites) the name
 *   takes its own line and the status, icons and last contact go
 *   below, with wrap, so the name is not truncated.
 * - Avatar: photo only if `profile_photo` is truthy; otherwise initials (bug 9.1).
 * - Row of social icons based on `contact_types`.
 * - Hover (grid): inline buttons (call / email / mark contacted).
 * - Click on the body → /persons/{id}/.
 *
 * Hover actions are placeholders when there is no external callback:
 * - call / email: navigate to the detail page.
 * - mark contacted: calls `onMarkContacted` if provided; otherwise it is not shown.
 */
import { Check, Loader2, Mail, Phone } from "lucide-react";
import { useTranslation } from "../../i18n";
import { IconByKey } from "../ui/icons";
import Avatar from "../ui/Avatar";
import AiMark from "../ui/AiMark";
import TagPill from "../ui/TagPill";
import { STATUS_TOKENS } from "../../styles/tokens";
import { formatDate, formatRelative } from "../../utils/format";
import type { PersonListItem } from "../../types";
import {
  CONTACT_TYPE_SUGGESTIONS,
  SOCIAL_CONTACT_TYPES,
} from "./detail/helpers";

interface Props {
  person: PersonListItem;
  /** If provided, the "mark contacted" button invokes it instead of navigating. */
  onMarkContacted?: (person: PersonListItem) => void;
  /** Variant: "grid" (full card) or "row" (dense row without card). */
  variant?: "grid" | "row";
  /** "row" variant only: meta below the name instead of on the right. */
  compact?: boolean;
  /** True while the "mark contacted" request for this person is in flight. */
  busy?: boolean;
}

function fullNameOf(p: PersonListItem): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.nick_name || "?";
}

/** Meta line: nickname · role · company (no quotes around the nickname). */
function metaOf(p: PersonListItem): string {
  return [p.nick_name, p.role, p.company].filter(Boolean).join(" · ");
}

/** Returns the social types (whatsapp, instagram, etc.) that this person
 * has loaded, in CONTACT_TYPE_SUGGESTIONS order. */
function socialTypesFor(person: PersonListItem): string[] {
  const have = new Set(person.contact_types ?? []);
  return CONTACT_TYPE_SUGGESTIONS
    .map((c) => c.key)
    .filter((k) => SOCIAL_CONTACT_TYPES.has(k) && have.has(k));
}

function SocialIcons({ types, t }: { types: string[]; t: (k: string) => string }) {
  if (types.length === 0) return null;
  const visible = types.slice(0, 5);
  const overflow = types.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-fg-muted">
      {visible.map((key) => (
        <span key={key} title={t(`enums.contact.types.${key}`)} role="img" aria-label={t(`enums.contact.types.${key}`)}>
          <IconByKey name={key} className="size-3.5" aria-hidden="true" />
        </span>
      ))}
      {overflow > 0 && <span className="text-xs tabular-nums">+{overflow}</span>}
    </div>
  );
}

export default function PersonCard({
  person,
  onMarkContacted,
  variant = "grid",
  compact = false,
  busy = false,
}: Props) {
  const { t, lang } = useTranslation();

  const cadenceToken = STATUS_TOKENS[person.cadence_status];
  const fullName = fullNameOf(person);
  const meta = metaOf(person);
  const detailHref = `/persons/${person.id}/`;
  const socials = socialTypesFor(person);

  const lastContact = person.last_contacted_at ? (
    <span
      className="text-xs text-fg-muted tabular-nums"
      title={formatDate(person.last_contacted_at, lang)}
    >
      {formatRelative(person.last_contacted_at, lang)}
    </span>
  ) : (
    <span className="text-xs text-fg-muted">{t("person.last_contact_never")}</span>
  );

  const cadenceBadge = cadenceToken ? (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cadenceToken.badge}`}>
      {t(`enums.cadence_status.${person.cadence_status}`)}
    </span>
  ) : null;

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Do not intercept if the click came from an inner button/link.
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    window.location.assign(detailHref);
  };

  const handleCardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    e.preventDefault();
    window.location.assign(detailHref);
  };

  // === ROW VARIANT (dense row, inside a card with divide-y) ===
  if (variant === "row") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-muted">
        <a href={detailHref} aria-label={fullName} tabIndex={-1} className="shrink-0 no-underline">
          <Avatar name={fullName} photoId={person.profile_photo} size="sm" />
        </a>

        <div className="min-w-0 flex-1">
          <a
            href={detailHref}
            title={fullName}
            className="line-clamp-2 break-words text-sm font-medium text-fg no-underline hover:underline"
          >
            {fullName}
          </a>
          {meta && <p className="truncate text-xs text-fg-muted">{meta}</p>}
          <AiMark createdVia={person.created_via} />
          {compact && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {cadenceBadge}
              <SocialIcons types={socials} t={t} />
              {lastContact}
            </div>
          )}
        </div>

        {!compact && (
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            <SocialIcons types={socials} t={t} />
            {cadenceBadge}
            <span className="w-24 text-right">{lastContact}</span>
          </div>
        )}

        {onMarkContacted && (
          <button
            type="button"
            onClick={() => onMarkContacted(person)}
            disabled={busy}
            aria-busy={busy}
            className="btn-icon"
            title={t("person.mark_contacted_today")}
            aria-label={t("person.mark_contacted_today")}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );
  }

  // === GRID VARIANT (full card) ===
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      className="neo-card neo-card-hover group relative flex cursor-pointer flex-col gap-4 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Header: avatar + name + meta */}
      <div className="flex items-center gap-3">
        <Avatar name={fullName} photoId={person.profile_photo} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{fullName}</h3>
          {meta && <p className="truncate text-xs text-fg-muted">{meta}</p>}
          <AiMark createdVia={person.created_via} />
        </div>
      </div>

      {/* Tags (max 3) */}
      {person.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {person.tags.slice(0, 3).map((tag) => (
            <TagPill key={tag.id} name={tag.name} color={tag.color} />
          ))}
          {person.tags.length > 3 && (
            <span className="text-xs text-fg-muted tabular-nums">+{person.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Status + social icons + last contact */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {cadenceBadge}
          <SocialIcons types={socials} t={t} />
        </div>
        {lastContact}
      </div>

      {/* Hover overlay: quick actions (solid background, no blur) */}
      <div className="pointer-events-none absolute inset-x-5 bottom-5 flex items-center gap-1 bg-surface opacity-0 transition-opacity duration-normal group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <a
          href={detailHref}
          className="btn-icon no-underline"
          aria-label={t("person.action_call")}
          title={t("person.action_call")}
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="size-4" aria-hidden="true" />
        </a>
        <a
          href={detailHref}
          className="btn-icon no-underline"
          aria-label={t("person.action_email")}
          title={t("person.action_email")}
          onClick={(e) => e.stopPropagation()}
        >
          <Mail className="size-4" aria-hidden="true" />
        </a>
        {onMarkContacted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkContacted(person);
            }}
            disabled={busy}
            aria-busy={busy}
            className="neo-btn neo-btn-primary neo-btn-sm ml-auto min-w-0"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            <span className="truncate">{t("person.mark_contacted_today")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
