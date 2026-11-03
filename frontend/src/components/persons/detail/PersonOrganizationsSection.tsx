/**
 * PersonOrganizationsSection — "Organizations" section of the Contact tab.
 *
 * Lists the person's memberships (`person.organizations`) and allows
 * adding them to an organization (role + current) or removing them. After each change
 * it re-fetches the person to refresh `organizations`.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Organization, Person, PersonMembership } from "../../../types";
import { apiFetch, ApiError } from "../../../lib/api";
import { toast } from "../../../lib/toaster";
import { useTranslation } from "../../../i18n";
import Modal from "./Modal";
import ConfirmModal from "../../ui/ConfirmModal";

interface Props {
  person: Person;
  onPersonUpdate: (p: Person) => void;
}

export default function PersonOrganizationsSection({ person, onPersonUpdate }: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PersonMembership | null>(null);
  const memberships = person.organizations ?? [];

  const refreshPerson = async () => {
    const fresh = await apiFetch<Person>(`/api/persons/${person.id}/`);
    onPersonUpdate(fresh);
  };

  const handleRemove = async (m: PersonMembership) => {
    try {
      await apiFetch<void>(`/api/organizations/${m.organization_id}/members/${m.membership_id}/`, {
        method: "DELETE",
      });
      toast.success(t("person.organizations.removed"));
      setRemoving(null);
      await refreshPerson();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : t("messages.error_generic"));
      setRemoving(null);
    }
  };

  return (
    <section className="py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold">{t("person.organizations.title")}</h3>
        <button type="button" className="neo-btn neo-btn-sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" /> {t("person.organizations.add")}
        </button>
      </div>

      {memberships.length === 0 ? (
        <p className="text-xs text-fg-muted">{t("person.organizations.empty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {memberships.map((m) => (
            <li key={m.membership_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <a
                  href={`/organizations/${m.organization_id}/`}
                  className="block truncate text-sm font-medium text-fg no-underline hover:text-primary hover:underline"
                >
                  {m.name}
                </a>
                <p className="truncate text-xs text-fg-muted">
                  {[
                    m.role,
                    t(m.is_current ? "organization.members.current" : "organization.members.past"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                className="btn-icon btn-icon-danger"
                onClick={() => setRemoving(m)}
                aria-label={t("common.delete")}
                title={t("common.delete")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddMembershipModal
          personId={person.id}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await refreshPerson();
          }}
        />
      )}

      <ConfirmModal
        open={removing !== null}
        title={t("common.delete")}
        message={
          removing
            ? t("person.organizations.remove_confirm", { org: removing.name })
            : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => (removing ? handleRemove(removing) : undefined)}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

function AddMembershipModal({
  personId,
  onClose,
  onAdded,
}: {
  personId: number;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Organization[]>("/api/organizations/")
      .then((data) => {
        if (!cancelled) setOrgs(data);
      })
      .catch(() => {
        if (cancelled) return;
        setOrgs([]);
        toast.error(t("person.organizations.errors.orgs_load_failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      setError(t("person.organizations.errors.org_required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/organizations/${orgId}/members/`, {
        method: "POST",
        body: { person_id: personId, role: role.trim(), is_current: isCurrent },
      });
      toast.success(t("person.organizations.added"));
      await onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t("messages.error_generic"));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("person.organizations.add")}
      size="md"
      footer={
        <>
          <button type="button" className="neo-btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="person-organization-form"
            className="neo-btn neo-btn-primary"
            disabled={busy || orgs === null || orgs.length === 0}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      {orgs !== null && orgs.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm">{t("person.organizations.none_available")}</p>
          <a href="/organizations/new/" className="neo-btn neo-btn-sm no-underline">
            {t("organization.add")}
          </a>
        </div>
      ) : (
        <form id="person-organization-form" onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="po-org" className="mb-1.5 block text-sm font-medium">
              {t("organization.title_singular")}
            </label>
            <select
              id="po-org"
              className="neo-input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              disabled={orgs === null}
            >
              <option value="">{t("person.organizations.select")}</option>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po-role" className="mb-1.5 block text-sm font-medium">
              {t("organization.members.role")}
            </label>
            <input
              id="po-role"
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
          {error && (
            <p
              role="alert"
              className="rounded-md bg-status-overdue px-3 py-2 text-sm font-medium text-status-overdue-fg"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
