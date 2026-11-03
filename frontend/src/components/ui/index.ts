/**
 * UI primitives barrel — re-exports of the shared primitives.
 * Import from here to avoid long paths:
 *
 *   import { Skeleton, PersonCardSkeleton } from "../ui";
 */

export {
  Skeleton,
  SkeletonBlock,
  SkeletonCircle,
  SkeletonText,
  SkeletonGroup,
} from "./Skeleton";

export {
  PersonCardSkeleton,
  PersonListRowSkeleton,
  DashboardWidgetSkeleton,
  ReminderRowSkeleton,
  TagCardSkeleton,
  SettingsSectionSkeleton,
  PersonDetailSkeleton,
  ContactInfoRowSkeleton,
  TimelineItemSkeleton,
  ImportantDateCardSkeleton,
  BorderedListSkeleton,
  MemberRowSkeleton,
  FileRowSkeleton,
  StorageRowSkeleton,
  AttachmentGridSkeleton,
  OrganizationFilesSkeleton,
  OrganizationCardSkeleton,
  OrganizationDetailSkeleton,
  TagRowSkeleton,
  ActivityRowSkeleton,
  KanbanBoardSkeleton,
  FormFieldsSkeleton,
  DashboardSkeleton,
  IntegrationsBodySkeleton,
} from "./Skeletons";

export { default as LoadingSwap } from "./LoadingSwap";
export type { LoadingSwapProps } from "./LoadingSwap";

export { IconByKey, ICONS, DATE_ICON_KEYS, resolveDateIconKey } from "./icons";

export { default as Avatar, avatarTone, avatarInitials } from "./Avatar";
export type { AvatarSize, AvatarShape } from "./Avatar";
export { default as Tabs } from "./Tabs";
export type { TabItem } from "./Tabs";
export { default as SegmentedControl } from "./SegmentedControl";
export type { SegmentOption } from "./SegmentedControl";
export { default as EmptyState } from "./EmptyState";
export { default as AiMark } from "./AiMark";
export { default as Logo } from "./Logo";
