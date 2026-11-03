/**
 * Composite skeletons — placeholders that imitate the real cards/rows.
 *
 * The shape matches the dimensions and visual composition of each view,
 * so when the data arrives the transition does not jump. Adjust here if
 * the real component's layout changes.
 *
 * All use semantic tokens (`bg-muted`, `border-border`, etc.) — they
 * adapt on their own when the theme changes.
 */
import { Fragment, type ReactNode } from "react";
import { Skeleton, SkeletonCircle, SkeletonText } from "./Skeleton";

// ---------------------------------------------------------------------------
// Person card — grid view (PersonCard.tsx)
// ---------------------------------------------------------------------------

/**
 * Imitates a PersonCard in grid (avatar + name + 2 lines + badge + button).
 * Avatar size 64px to match the `PersonCard` grid.
 */
export function PersonCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="neo-card flex min-h-[12rem] flex-col gap-4 p-5"
    >
      <div className="flex items-center gap-3">
        <SkeletonCircle size="2.5rem" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4" style={{ width: "75%" }} />
          <Skeleton className="h-3" style={{ width: "50%" }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <Skeleton className="h-5" style={{ width: "4rem" }} />
        <Skeleton className="h-5" style={{ width: "3rem" }} />
      </div>
    </div>
  );
}

/** List/row variant (PersonCard variant="row"). 40px avatar, horizontal layout. */
export function PersonListRowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 px-4 py-3"
    >
      <SkeletonCircle size="2rem" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4" style={{ width: "40%" }} />
        <Skeleton className="h-3" style={{ width: "25%" }} />
      </div>
      <Skeleton className="h-5" style={{ width: "5rem" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — widgets (DashboardView.tsx)
// ---------------------------------------------------------------------------

/** Imitates a dashboard widget (header with title + count + item list). */
export function DashboardWidgetSkeleton({
  itemCount = 3,
}: {
  itemCount?: number;
}) {
  return (
    <section
      aria-hidden="true"
      className="neo-card flex min-h-[12rem] flex-col gap-4 p-5"
    >
      <header className="flex items-center justify-between gap-2">
        <Skeleton className="h-5" style={{ width: "40%" }} />
        <Skeleton className="h-5" style={{ width: "2.5rem" }} />
      </header>
      <div className="flex-1 space-y-3">
        {Array.from({ length: itemCount }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <SkeletonCircle size="2.25rem" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3" style={{ width: "70%" }} />
              <Skeleton className="h-2.5" style={{ width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reminder row (RemindersView.tsx + ReminderRow.tsx)
// ---------------------------------------------------------------------------

/** Imitates a reminder row: checkbox + title + date + person + badge. */
export function ReminderRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-4 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4" style={{ width: "55%" }} />
        <Skeleton className="h-3" style={{ width: "35%" }} />
      </div>
      <Skeleton className="h-5" style={{ width: "4rem" }} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tag card (TagsView.tsx)
// ---------------------------------------------------------------------------

/** Imitates a tag card: large swatch + name + count + delete button. */
export function TagCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="neo-card flex min-h-[12rem] flex-col gap-4 p-5"
    >
      <Skeleton className="size-16" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5" style={{ width: "70%" }} />
        <Skeleton className="h-3" style={{ width: "40%" }} />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-8" style={{ width: "5rem" }} />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Settings tab (SettingsView.tsx — content slot)
// ---------------------------------------------------------------------------

/** Imitates the content of a Settings tab: sections with title + fields. */
export function SettingsSectionSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div aria-hidden="true" className="space-y-6">
      {Array.from({ length: sections }, (_, i) => (
        <section key={i} className="space-y-4">
          <Skeleton className="h-5" style={{ width: "30%" }} />
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" style={{ width: "80%" }} />
          </div>
          <div className="pt-2">
            <Skeleton className="h-9" style={{ width: "8rem" }} />
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person detail (PersonDetailView.tsx) — header + tabs + content placeholder
// ---------------------------------------------------------------------------

/** Imitates a person's full detail page. */
export function PersonDetailSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      {/* Header card (avatar + name + tags + actions) */}
      <div className="neo-card flex flex-col gap-4 p-5 md:flex-row md:gap-6">
        <SkeletonCircle size="4rem" />
        <div className="flex-1 min-w-0 space-y-3">
          <Skeleton className="h-7" style={{ width: "45%" }} />
          <Skeleton className="h-4" style={{ width: "30%" }} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-5" style={{ width: "5rem" }} />
            <Skeleton className="h-5" style={{ width: "4rem" }} />
            <Skeleton className="h-5" style={{ width: "3.5rem" }} />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-9" style={{ width: "10rem" }} />
            <Skeleton className="h-9" style={{ width: "6rem" }} />
          </div>
        </div>
      </div>

      {/* Tabs row */}
      <nav className="flex gap-6 border-b border-border" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="mb-2.5 h-5" style={{ width: "5rem" }} />
        ))}
      </nav>

      {/* Content placeholder (active tab panel) */}
      <div className="neo-card p-5">
        <SkeletonText lines={4} lastWidth="55%" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactInfo item (ContactTab.tsx) — used in the Contact tab of the detail
// ---------------------------------------------------------------------------

/** Imitates a contact row: type chip + value + label + actions. */
export function ContactInfoRowSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="flex items-center gap-3 px-4 py-3"
    >
      <Skeleton className="h-6" style={{ width: "6rem" }} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4" style={{ width: "60%" }} />
        <Skeleton className="h-3" style={{ width: "30%" }} />
      </div>
      <Skeleton className="size-8" />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Interaction / Note item — for the Interactions and Notes tabs
// ---------------------------------------------------------------------------

/** Imitates a timeline item (interaction or note): icon + date + body. */
export function TimelineItemSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="flex gap-3 px-4 py-3"
    >
      <SkeletonCircle size="2rem" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4" style={{ width: "20%" }} />
          <Skeleton className="h-3" style={{ width: "15%" }} />
        </div>
        <SkeletonText lines={2} lastWidth="70%" />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// ImportantDate card — used in the Dates tab and dashboard upcoming events
// ---------------------------------------------------------------------------

/** Imitates an ImportantDate card: icon + title + next occurrence. */
export function ImportantDateCardSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="flex items-center gap-3 px-4 py-3"
    >
      <SkeletonCircle size="2rem" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4" style={{ width: "55%" }} />
        <Skeleton className="h-3" style={{ width: "30%" }} />
      </div>
      <Skeleton className="h-5" style={{ width: "4rem" }} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Spec v7 N — skeletons shaped like the real content (used with LoadingSwap)
// ---------------------------------------------------------------------------

/**
 * Bordered list (`ul.divide-y.rounded-md.border`) of N `li` rows. It is the container
 * of the detail tabs (Interactions, Notes, Dates, Members, Storage).
 * `row` renders one row; by default a timeline item.
 */
export function BorderedListSkeleton({
  rows = 3,
  row,
}: {
  rows?: number;
  row?: () => ReactNode;
}) {
  return (
    <ul
      aria-hidden="true"
      className="divide-y divide-border overflow-hidden rounded-md border border-border"
    >
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>{row ? row() : <TimelineItemSkeleton />}</Fragment>
      ))}
    </ul>
  );
}

/** Row of a people/members list: avatar + name + role + two icon buttons. */
export function MemberRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <SkeletonCircle size="2.5rem" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4" style={{ width: "40%" }} />
        <Skeleton className="h-3" style={{ width: "28%" }} />
      </div>
      <Skeleton className="size-8" />
      <Skeleton className="size-8" />
    </li>
  );
}

/** File/attachment row: round icon + title + size + button. */
export function FileRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <SkeletonCircle size="2rem" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4" style={{ width: "50%" }} />
        <Skeleton className="h-3" style={{ width: "25%" }} />
      </div>
      <Skeleton className="size-8" />
    </li>
  );
}

/** Settings > Storage row: name + size + date. */
export function StorageRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-4 flex-1" style={{ maxWidth: "50%" }} />
      <Skeleton className="ml-auto h-3" style={{ width: "3.5rem" }} />
      <Skeleton className="hidden h-3 sm:block" style={{ width: "7rem" }} />
    </li>
  );
}

/** Grid of attachment thumbnails (same grid as AttachmentsTab / OrganizationFilesTab). */
export function AttachmentGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="neo-card flex flex-col overflow-hidden">
          <Skeleton className="aspect-square w-full !rounded-none" />
          <div className="space-y-1.5 p-3">
            <Skeleton className="h-3.5" style={{ width: "70%" }} />
            <Skeleton className="h-3" style={{ width: "40%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Organizations > Files tab: photo block + document block. */
export function OrganizationFilesSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <section className="space-y-4">
        <Skeleton className="h-3" style={{ width: "4rem" }} />
        <AttachmentGridSkeleton count={4} />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-3" style={{ width: "6rem" }} />
        <BorderedListSkeleton rows={2} row={() => <FileRowSkeleton />} />
      </section>
    </div>
  );
}

/** Organization card in the /organizations/ grid (logo + name + meta + count). */
export function OrganizationCardSkeleton() {
  return (
    <div aria-hidden="true" className="neo-card flex items-center gap-3 p-5">
      <Skeleton className="size-10 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4" style={{ width: "75%" }} />
        <Skeleton className="h-3" style={{ width: "50%" }} />
        <Skeleton className="h-3" style={{ width: "30%" }} />
      </div>
    </div>
  );
}

/** Organization detail: header + tabs + panel. */
export function OrganizationDetailSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <div className="neo-card flex items-center gap-4 p-5">
        <Skeleton className="size-16 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-6" style={{ width: "35%" }} />
          <Skeleton className="h-4" style={{ width: "25%" }} />
        </div>
        <Skeleton className="h-8" style={{ width: "5rem" }} />
      </div>
      <nav className="flex gap-6 border-b border-border">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="mb-2.5 h-5" style={{ width: "5rem" }} />
        ))}
      </nav>
      <div className="neo-card p-5">
        <SkeletonText lines={4} lastWidth="55%" />
      </div>
    </div>
  );
}

/** Tags row: color dot + name/count + two icon buttons. */
export function TagRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <SkeletonCircle size="1rem" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4" style={{ width: "30%" }} />
        <Skeleton className="h-3" style={{ width: "18%" }} />
      </div>
      <Skeleton className="size-8" />
      <Skeleton className="size-8" />
    </li>
  );
}

/** AI Activity row: tool + summary + meta (+ undo button). */
export function ActivityRowSkeleton() {
  return (
    <li aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4" style={{ width: "35%" }} />
        <Skeleton className="h-3" style={{ width: "55%" }} />
      </div>
      <Skeleton className="h-8" style={{ width: "5.5rem" }} />
    </li>
  );
}

/** Reminders board: three columns with header and cards. */
export function KanbanBoardSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-lg bg-secondary p-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Stacked form fields (label + input). For modals that load data. */
export function FormFieldsSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5" style={{ width: "6rem" }} />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Full Home page: quick-add bar + grid of cards. */
export function DashboardSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2">
          <div className="neo-card min-h-[20rem] space-y-4 p-5">
            <Skeleton className="h-6" style={{ width: "30%" }} />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
        <DashboardWidgetSkeleton itemCount={4} />
        <DashboardWidgetSkeleton />
        <DashboardWidgetSkeleton />
        <DashboardWidgetSkeleton />
      </div>
    </div>
  );
}

/** Settings > Integrations (below the switch): connection, client and tokens. */
export function IntegrationsBodySkeleton() {
  return (
    <div aria-hidden="true" className="divide-y divide-border">
      <section className="space-y-3 py-5">
        <Skeleton className="h-4" style={{ width: "25%" }} />
        <Skeleton className="h-3" style={{ width: "60%" }} />
        <Skeleton className="h-32 w-full" />
      </section>
      <section className="space-y-3 py-5">
        <Skeleton className="h-4" style={{ width: "30%" }} />
        <Skeleton className="h-3" style={{ width: "55%" }} />
        <Skeleton className="h-40 w-full" />
      </section>
      <section className="space-y-3 py-5">
        <Skeleton className="h-4" style={{ width: "20%" }} />
        <BorderedListSkeleton rows={2} row={() => <TagRowSkeleton />} />
      </section>
    </div>
  );
}
