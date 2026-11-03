/**
 * Shared types of the CRM domain. Mirror of the Django backend.
 * Backend enum keys are in English (frontend-plan D8); translatable via i18n.
 */

export type Lang = "es" | "en";

export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  preferred_lang?: Lang;
  preferred_theme?: "light" | "dark";
  /** Accent color `#rrggbb`. */
  preferred_accent?: string;
  /** False until the user completes or skips /welcome/. */
  onboarding_completed?: boolean;
  /** Custom sidebar name. Empty/null → use i18n `shell.app_name`. */
  sidebar_name?: string | null;
  /** Absolute URL (with PUBLIC_API_URL) of the sidebar icon, or null. */
  sidebar_icon?: string | null;
  /** URL of the user's profile photo, or null. */
  avatar?: string | null;
  /** AI agent (MCP) access enabled. */
  mcp_enabled?: boolean;
}

/** Origin of a record: form (ui), AI agent (mcp) or import. */
export type CreatedVia = "ui" | "mcp" | "import";

/* ============ Person ============ */

export type CadenceStatus =
  | "no_cadence"
  | "unknown"
  | "ok"
  | "due_soon"
  | "overdue";

export interface Person {
  id: number;
  first_name: string;
  last_name: string;
  nick_name: string;
  company: string;
  role: string;
  how_we_met: string;
  favorite: boolean;
  cadence_days: number | null;
  last_contacted_at: string | null;
  cadence_status: CadenceStatus;
  tags: Tag[];
  /**
   * Loaded contact types (e.g. ["whatsapp", "instagram", "linkedin"]).
   * Only the types — the values remain private and live in the detail.
   */
  contact_types: string[];
  /** Memberships in organizations (read-only, see backend PersonSerializer). */
  organizations?: PersonMembership[];
  profile_photo: number | null; // Attachment.id (OneToOne)
  created_via?: CreatedVia;
  created_at: string;
  updated_at: string;
}

export interface PersonMembership {
  membership_id: number;
  organization_id: number;
  name: string;
  kind: OrganizationKind;
  role: string;
  is_current: boolean;
}

export interface PersonListItem {
  id: number;
  first_name: string;
  last_name: string;
  nick_name: string;
  company: string;
  role: string;
  favorite: boolean;
  cadence_days: number | null;
  last_contacted_at: string | null;
  cadence_status: CadenceStatus;
  tags: Tag[];
  contact_types: string[];
  organizations?: PersonMembership[];
  profile_photo: number | null;
  created_via?: CreatedVia;
}

/* ============ ContactInfo ============ */

export interface ContactInfo {
  id: number;
  person: number;
  type: string; // free-form, see settings.CONTACT_TYPE_SUGGESTIONS
  type_display: string;
  value: string;
  label: string;
  created_at: string;
}

/* ============ ImportantDate ============ */

export type DateKind = "birthday" | "custom";

export interface ImportantDate {
  id: number;
  person: number;
  kind: DateKind;
  birth_year: number | null;
  title: string;
  description: string;
  icon: string;
  icon_image: number | null; // Attachment.id
  attachment: number | null;
  date: string; // YYYY-MM-DD
  days_until_next: number | null;
  age: number | null;
}

/* ============ Reminder ============ */

export type Recurrence = "none" | "yearly" | "monthly" | "weekly";
export type ReminderStatus = "todo" | "in_progress" | "done";
export type ReminderKind = "task" | "call" | "meeting" | "birthday" | "other";

export interface ReminderParticipant {
  id: number;
  display_name: string;
}

export interface Reminder {
  id: number;
  owner: number;
  person: number | null;
  title: string;
  remind_at: string;
  recur: Recurrence;
  lead_minutes: number;
  message: string;
  completed: boolean;
  status: ReminderStatus;
  kind: ReminderKind;
  location: string;
  /** ids of extra people (write). */
  participants: number[];
  participants_detail: ReminderParticipant[];
  created_via?: CreatedVia;
  created_at: string;
  updated_at?: string;
}

/* ============ Note ============ */

export type NoteCategory = "general" | "followup" | "gift_idea" | "important";

export interface Note {
  id: number;
  person: number;
  body: string;
  category: NoteCategory;
  category_display: string;
  created_at: string;
  updated_at: string;
}

/* ============ Interaction ============ */

export type InteractionKind =
  | "call"
  | "message"
  | "email"
  | "meeting_in_person"
  | "video_call"
  | "gift"
  | "note_shared"
  | "other";

export interface Interaction {
  id: number;
  person: number;
  kind: InteractionKind;
  occurred_at: string;
  channel: string;
  body: string;
  counts_as_contact: boolean;
  attachments: Attachment[];
}

/* ============ Organization ============ */

export type OrganizationKind =
  | "university"
  | "school"
  | "company"
  | "government"
  | "health"
  | "community"
  | "other";

export interface Organization {
  id: number;
  name: string;
  kind: OrganizationKind;
  /** Logo URL (the backend returns it absolute or with /media/) or null. */
  logo: string | null;
  address: string;
  city: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
  phone: string;
  email: string;
  website: string;
  notes: string;
  tags: Tag[];
  member_count: number;
  attachments_count: number;
  created_via?: CreatedVia;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  membership_id: number;
  person_id: number;
  person_name: string;
  organization_id: number;
  role: string;
  is_current: boolean;
  start_year: number | null;
  end_year: number | null;
}

export interface OrganizationMemberInput {
  person_id?: number;
  role?: string;
  is_current?: boolean;
  start_year?: number | null;
  end_year?: number | null;
}

/* ============ Tag ============ */

export interface Tag {
  id: number;
  name: string;
  color: string;
  person_count?: number;
}

/* ============ Attachment ============ */

export interface Attachment {
  id: number;
  owner: number;
  title: string;
  description: string;
  file: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  subject_type: string; // app_label.model
  subject_id: number;
}

/* ============ Dashboard ============ */

/** Why contacting a person is suggested (in priority order). */
export type SuggestionReason = "overdue" | "due_soon" | "frequent" | "never_contacted";

export interface DashboardSuggestion {
  person: PersonListItem;
  reason: SuggestionReason;
  /**
   * overdue: days overdue; due_soon: days remaining; frequent: days since the
   * last contact; never_contacted: null.
   */
  days: number | null;
}

export interface DashboardData {
  /** ImportantDate within the calendar range (default: 60 days). */
  calendar: ImportantDate[];
  /** Last N people created (default: 10), ordered by created_at desc. */
  recent: PersonListItem[];
  /** Number of people marked as favorites. */
  favorite_count: number;
  /** List of favorite people (top 10), for the home card. */
  favorites: PersonListItem[];
  /** Birthdays and dates in the next 30 days (max 6), with the person summarized. */
  upcoming_events: Array<ImportantDate & { person: PersonListItem }>;
  /** Reminders todo / in_progress, overdue first (max 8). */
  pending_reminders: Reminder[];
  /** Total pending reminders (may be greater than the ones shown). */
  pending_reminders_total: number;
  /** Non-favorite people suggested for contact (max 6). */
  suggestions: DashboardSuggestion[];
}

/* ============ Forms / creation ============ */

export interface PersonCreate {
  first_name: string;
  last_name?: string;
  nick_name?: string;
  company?: string;
  role?: string;
  how_we_met?: string;
  favorite?: boolean;
  cadence_days?: number | null;
  tag_ids?: number[];
}

export interface ContactInfoCreate {
  type: string;
  value: string;
  label?: string;
}

export interface ReminderCreate {
  title: string;
  remind_at: string;
  recur?: Recurrence;
  lead_minutes?: number;
  message?: string;
  person?: number | null;
  status?: ReminderStatus;
  kind?: ReminderKind;
  location?: string;
  participants?: number[];
}

export interface NoteCreate {
  body: string;
  category?: NoteCategory;
}

export interface ImportantDateCreate {
  kind: DateKind;
  title: string;
  description?: string;
  date: string;
  birth_year?: number | null;
  icon?: string;
}

export interface InteractionCreate {
  kind: InteractionKind;
  occurred_at: string;
  channel?: string;
  body?: string;
  counts_as_contact?: boolean;
}

/* ============ MCP (AI agents) ============ */

export type McpScope = "read" | "write";

export interface McpToken {
  id: number;
  name: string;
  prefix: string;
  scopes: McpScope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  /** The full token can be shown again (GET /reveal/). */
  can_reveal: boolean;
}

/** Response of the creation POST: includes the full token (shown once). */
export interface McpTokenCreated extends McpToken {
  token: string;
}

export interface McpConfig {
  /** Public URL configured by the server (MCP_PUBLIC_URL); null = use the browser origin. */
  public_url: string | null;
  /** Project paths for stdio; only comes for staff or with DEBUG. */
  stdio?: {
    project_dir: string;
    python: string;
    manage_py: string;
  };
}

export interface AgentAction {
  id: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: "ok" | "error";
  target_type: string;
  target_id: number | null;
  /** Person to link objects that hang off a person. */
  link_person_id: number | null;
  error_message: string;
  created_at: string;
  undone_at: string | null;
  token_name: string | null;
  can_undo: boolean;
}

/* ============ Settings.ContactType suggestion ============ */

export interface ContactTypeSuggestion {
  key: string;
  label: string;
  icon: string;
}

/* ============ UI prefs ============ */

export type ThemeId = "light" | "dark";
