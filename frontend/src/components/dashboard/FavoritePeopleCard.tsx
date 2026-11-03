/**
 * FavoritePeopleCard — compact list of favorite people for the home page.
 *
 * - With favorites: card with divided rows (PersonCard variant="row").
 * - With NO favorites: empty state with a CTA to the people list so
 *   the user knows how to mark favorites from the detail page.
 *
 * Appears next to the calendar in the DashboardView 2-col grid.
 */
import { Star } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { PersonListItem } from "../../types";
import PersonCard from "../persons/PersonCard";
import EmptyState from "../ui/EmptyState";

interface Props {
  people: PersonListItem[];
  onMarkContacted?: (person: PersonListItem) => void;
  /** Id of the person with "mark contacted" in progress (busy state). */
  busyId?: number | null;
}

export default function FavoritePeopleCard({ people, onMarkContacted, busyId = null }: Props) {
  const { t } = useTranslation();

  if (people.length === 0) {
    return (
      <section className="neo-card space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("dashboard.favorites_title")}</h2>
        <EmptyState
          icon={Star}
          title={t("dashboard.favorites_empty")}
          description={t("dashboard.favorites_empty_hint")}
          action={
            <a href="/persons/" className="neo-btn neo-btn-sm no-underline">
              {t("dashboard.favorites_empty_cta")}
            </a>
          }
        />
      </section>
    );
  }

  return (
    <section className="neo-card overflow-hidden">
      <h2 className="px-4 py-3 text-sm font-semibold">{t("dashboard.favorites_title")}</h2>
      <div className="divide-y divide-border border-t border-border">
        {people.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            variant="row"
            compact
            onMarkContacted={onMarkContacted}
            busy={busyId === p.id}
          />
        ))}
      </div>
    </section>
  );
}
