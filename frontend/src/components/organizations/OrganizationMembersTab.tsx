/**
 * OrganizationMembersTab — people linked to an organization.
 *
 * Divided list with Avatar, name (link to the person), role and status
 * (current / past). Add with person selector + role; edit and delete
 * as row actions.
 */
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import type { OrganizationMember, OrganizationMemberInput, PersonListItem } from "../../types";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { toast } from "../../lib/toaster";
import Modal from "../persons/detail/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";
import { LoadingSwap, BorderedListSkeleton, MemberRowSkeleton } from "../ui";

interface Props {
  organizationId: number;
}

export default function OrganizationMembersTab({ organizationId }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OrganizationMember | "new" | null>(null);
  const [removing, setRemoving] = useState<OrganizationMember | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<OrganizationMember[]>(
        `/api/organizations/${organizationId}/members/`,
      );
      setMembers(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("messages.error_generic"));
    }
  }, [organizationId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRemove = async (m: OrganizationMember) => {
    try {
      await apiFetch<void>(`/api/organizations/${organizationId}/members/${m.membership_id}/`, {
        method: "DELETE",
      });
      toast.success(t("organization.members.removed"));
      setRemoving(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setRemoving(null);
    }
  };

  const addButton = (
    <button type="button" className="neo-btn neo-btn-sm" onClick={() => setEditing("new")}>
      <Plus className="size-4" aria-hidden="true" />
      {t("organization.members.add")}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold">{t("organization.tabs.people")}</h3>
        {members !== null && members.length > 0 && addButton}
      </div>

      <LoadingSwap
        loading={!loadError && members === null}
        label={t("common.loading")}
        skeleton={<BorderedListSkeleton rows={3} row={() => <MemberRowSkeleton />} />}
      >
      {loadError ? (
        <p role="alert" className="text-sm font-medium text-status-overdue-fg">
          {loadError}
        </p>
      ) : members === null ? null : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("organization.members.empty_title")}
          description={t("organization.members.empty")}
          action={addButton}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {members.map((m) => (
            <MemberRow
              key={m.membership_id}
              member={m}
              onEdit={() => setEditing(m)}
              onDelete={() => setRemoving(m)}
            />
          ))}
        </ul>
      )}
      </LoadingSwap>

      {editing !== null && (
        <MemberModal
          organizationId={organizationId}
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      <ConfirmModal
        open={removing !== null}
        title={t("common.delete")}
        message={
          removing ? t("organization.members.remove_confirm", { name: removing.person_name }) : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => (removing ? handleRemove(removing) : undefined)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function MemberRow({
  member: m,
  onEdit,
  onDelete,
}: {
  member: OrganizationMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const years =
    m.start_year && m.end_year
      ? `${m.start_year} - ${m.end_year}`
      : String(m.start_year ?? m.end_year ?? "");
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={m.person_name} size="sm" />
      <div className="min-w-0 flex-1">
        <a
          href={`/persons/${m.person_id}/`}
          className="block truncate text-sm font-medium text-fg no-underline hover:text-primary hover:underline"
        >
          {m.person_name}
        </a>
        <p className="truncate text-xs text-fg-muted">
          {[
            m.role,
            t(m.is_current ? "organization.members.current" : "organization.members.past"),
          ]
            .filter(Boolean)
            .join(" · ")}
          {years && <span className="tabular-nums"> · {years}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="btn-icon"
          onClick={onEdit}
          aria-label={t("common.edit")}
          title={t("common.edit")}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-danger"
          onClick={onDelete}
          aria-label={t("common.delete")}
          title={t("common.delete")}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function parseYear(v: string): number | null {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function MemberModal({
  organizationId,
  member,
  onClose,
  onSaved,
}: {
  organizationId: number;
  /** null = add. */
  member: OrganizationMember | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [persons, setPersons] = useState<PersonListItem[] | null>(null);
  const [personId, setPersonId] = useState(member ? String(member.person_id) : "");
  const [role, setRole] = useState(member?.role ?? "");
  const [isCurrent, setIsCurrent] = useState(member?.is_current ?? true);
  const [startYear, setStartYear] = useState(member?.start_year ? String(member.start_year) : "");
  const [endYear, setEndYear] = useState(member?.end_year ? String(member.end_year) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) return; // when editing, the person does not change
    let cancelled = false;
    apiFetch<PersonListItem[]>("/api/persons/")
      .then((data) => {
        if (!cancelled) setPersons(data);
      })
      .catch(() => {
        if (cancelled) return;
        setPersons([]);
        toast.error(t("organization.members.errors.persons_load_failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [member, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member && !personId) {
      setError(t("organization.members.errors.person_required"));
      return;
    }
    setBusy(true);
    setError(null);
    const body: OrganizationMemberInput = {
      role: role.trim(),
      is_current: isCurrent,
      start_year: parseYear(startYear),
      end_year: isCurrent ? null : parseYear(endYear),
    };
    try {
      if (member) {
        await apiFetch(`/api/organizations/${organizationId}/members/${member.membership_id}/`, {
          method: "PATCH",
          body,
        });
        toast.success(t("organization.members.saved"));
      } else {
        await apiFetch(`/api/organizations/${organizationId}/members/`, {
          method: "POST",
          body: { ...body, person_id: Number(personId) },
        });
        toast.success(t("organization.members.added"));
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? t("organization.members.edit") : t("organization.members.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="organization-member-form"
            className="neo-btn neo-btn-primary"
            disabled={busy}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <form id="organization-member-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="member-person" className="mb-1.5 block text-sm font-medium">
            {t("organization.members.person")}
          </label>
          {member ? (
            <p className="text-sm">{member.person_name}</p>
          ) : (
            <select
              id="member-person"
              className="neo-input"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              disabled={persons === null}
            >
              <option value="">{t("organization.members.select_person")}</option>
              {(persons ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name}
                  {p.last_name ? ` ${p.last_name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label htmlFor="member-role" className="mb-1.5 block text-sm font-medium">
            {t("organization.members.role")}
          </label>
          <input
            id="member-role"
            type="text"
            className="neo-input"
            value={role}
            maxLength={120}
            placeholder={t("organization.members.role_placeholder")}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded"
            checked={isCurrent}
            onChange={(e) => setIsCurrent(e.target.checked)}
          />
          {t("organization.members.is_current")}
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="member-start" className="mb-1.5 block text-sm font-medium">
              {t("organization.members.start_year")}
            </label>
            <input
              id="member-start"
              type="number"
              className="neo-input tabular-nums"
              min={1900}
              max={2100}
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="member-end" className="mb-1.5 block text-sm font-medium">
              {t("organization.members.end_year")}
            </label>
            <input
              id="member-end"
              type="number"
              className="neo-input tabular-nums"
              min={1900}
              max={2100}
              value={endYear}
              disabled={isCurrent}
              onChange={(e) => setEndYear(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
