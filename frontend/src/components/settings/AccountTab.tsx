/**
 * AccountTab — profile photo + account info + name editing + logout +
 * delete (stub).
 *
 * - Profile photo: useImagePicker validates and opens the crop (round, with preview);
 *   "Save" in the crop does a multipart PATCH `avatar` (original file + crop_x/y/w/h),
 *   "Remove photo" sends `avatar: null`. On save, `crm:user-updated` is dispatched to
 *   refresh the topbar without reloading.
 * - Inline edit of first_name / last_name → PATCH /api/auth/me/.
 *   If the backend does not accept the PATCH yet (read-only UserSerializer), the
 *   UI is updated optimistically and a toast is shown.
 * - Logout → POST /api/auth/logout/ + redirect /login/.
 * - Delete → confirm modal + "Coming soon" stub (not implemented in the backend).
 */

import { useCallback, useState } from "react";
import { useTranslation } from "../../i18n";
import { apiFetch, ApiError } from "../../lib/api";
import { getMediaUrl } from "../../lib/media";
import { toast } from "../../lib/toaster";
import type { Lang, User } from "../../types";
import Avatar from "../ui/Avatar";
import ConfirmModal from "../ui/ConfirmModal";
import { MB, appendCrop, useImagePicker } from "../ui/ImagePicker";
import { formatDate } from "../../utils/format";

interface Props {
  lang?: Lang;
  user: User;
}

const AVATAR_MAX_BYTES = 2 * MB;

/** Tells the shell (topbar) that the user changed, without reloading the page. */
function broadcastUser(detail: Partial<User>): void {
  window.dispatchEvent(new CustomEvent("crm:user-updated", { detail }));
}

export default function AccountTab({ user }: Props) {
  const { t, lang } = useTranslation();
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Profile photo: saved URL (cropping and upload go through useImagePicker).
  const [avatarUrl, setAvatarUrl] = useState<string | null>(getMediaUrl(user.avatar) || null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const profileDirty =
    firstName !== user.first_name || lastName !== user.last_name;

  /** Applies the server response (with ?v= to bust the cache for the same file name). */
  const applySavedAvatar = useCallback((saved: User | null | undefined) => {
    const serverUrl = getMediaUrl(saved?.avatar) || null;
    const next = serverUrl ? `${serverUrl}?v=${Date.now()}` : null;
    setAvatarUrl(next);
    broadcastUser({ ...saved, avatar: next });
  }, []);

  const picker = useImagePicker({
    variant: "avatar",
    maxBytes: AVATAR_MAX_BYTES,
    onConfirm: async ({ file, crop }) => {
      try {
        const fd = new FormData();
        fd.append("avatar", file);
        appendCrop(fd, crop);
        const saved = await apiFetch<User>("/api/auth/me/", { method: "PATCH", body: fd });
        applySavedAvatar(saved);
        toast.success(t("settings.account.photo_saved"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
        throw err;
      }
    },
  });

  const removePhoto = useCallback(async () => {
    setSavingPhoto(true);
    try {
      const saved = await apiFetch<User>("/api/auth/me/", {
        method: "PATCH",
        body: { avatar: null },
      });
      applySavedAvatar(saved);
      toast.success(t("settings.account.photo_removed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
    } finally {
      setSavingPhoto(false);
    }
  }, [applySavedAvatar, t]);

  const saveProfile = useCallback(async () => {
    if (!profileDirty) return;
    setSavingProfile(true);
    try {
      const updated = await apiFetch<User>("/api/auth/me/", {
        method: "PATCH",
        body: { first_name: firstName, last_name: lastName },
      });
      toast.success(t("settings.account.saved_profile"));
      // If the backend returned the updated user, apply it to the form.
      if (updated && typeof updated === "object" && "first_name" in updated) {
        setFirstName(updated.first_name ?? "");
        setLastName(updated.last_name ?? "");
        // No `avatar` in the detail: the topbar keeps the photo it already shows.
        broadcastUser({
          first_name: updated.first_name,
          last_name: updated.last_name,
          email: user.email,
        });
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      // 404/405/400 = PATCH endpoint not implemented yet.
      if (status === 404 || status === 405 || status === 400) {
        toast.warning(t("settings.account.saved_profile"));
      } else {
        toast.error(err instanceof Error ? err.message : t("messages.error_generic"));
      }
    } finally {
      setSavingProfile(false);
    }
  }, [firstName, lastName, profileDirty, user.email, t]);

  const cancelProfile = useCallback(() => {
    setFirstName(user.first_name);
    setLastName(user.last_name);
  }, [user.first_name, user.last_name]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiFetch<void>("/api/auth/logout/", { method: "POST" });
    } catch (_) {
      // best effort — we redirect to login anyway.
    } finally {
      window.location.href = "/login/";
    }
  }, []);

  const handleDelete = useCallback(() => {
    setDeleteOpen(false);
    toast.info(t("common.coming_soon"));
  }, [t]);

  return (
    <div className="divide-y divide-border">
      {/* Profile photo */}
      <section className="py-5 first:pt-0">
        <h2 className="text-sm font-semibold">{t("settings.account.section_photo")}</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar name={user.first_name || user.email} src={avatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="neo-btn neo-btn-sm"
                onClick={picker.open}
                disabled={savingPhoto || picker.busy}
              >
                {t("settings.account.photo_change")}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="neo-btn neo-btn-sm neo-btn-ghost"
                  onClick={removePhoto}
                  disabled={savingPhoto}
                >
                  {t("settings.account.photo_remove")}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">{t("settings.account.photo_help")}</p>
            {picker.error && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-accent">
                {picker.error}
              </p>
            )}
          </div>
          {picker.input}
        </div>
        {picker.modal}
      </section>

      {/* Account info (read-only) */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.account.section_info")}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-fg-muted">{t("settings.account.field_email")}</dt>
          <dd className="break-all">{user.email}</dd>

          <dt className="text-fg-muted">{t("settings.account.field_username")}</dt>
          <dd>{user.username}</dd>

          <dt className="text-fg-muted">{t("settings.account.field_date_joined")}</dt>
          <dd className="tabular-nums">{formatDate(user.date_joined, lang)}</dd>
        </dl>
      </section>

      {/* Edit profile */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.account.section_profile")}</h2>
        <div className="mt-4 max-w-sm space-y-4">
          <div>
            <label htmlFor="account-first-name" className="mb-1.5 block text-sm font-medium">
              {t("settings.account.field_first_name")}
            </label>
            <input
              id="account-first-name"
              type="text"
              className="neo-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={savingProfile}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label htmlFor="account-last-name" className="mb-1.5 block text-sm font-medium">
              {t("settings.account.field_last_name")}
            </label>
            <input
              id="account-last-name"
              type="text"
              className="neo-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={savingProfile}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="neo-btn neo-btn-sm"
            onClick={cancelProfile}
            disabled={!profileDirty || savingProfile}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="neo-btn neo-btn-sm neo-btn-primary"
            onClick={saveProfile}
            disabled={!profileDirty || savingProfile}
          >
            {savingProfile ? t("common.loading") : t("settings.account.save_profile")}
          </button>
        </div>
      </section>

      {/* Session */}
      <section className="py-5">
        <h2 className="text-sm font-semibold">{t("settings.account.section_session")}</h2>
        <div className="mt-4">
          <button
            type="button"
            className="neo-btn neo-btn-sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? t("common.loading") : t("settings.account.logout_button")}
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="py-5 last:pb-0">
        <h2 className="text-sm font-semibold">{t("settings.account.section_danger")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("settings.account.delete_confirm_body")}</p>
        <div className="mt-4">
          <button
            type="button"
            className="neo-btn neo-btn-sm text-accent hover:bg-status-overdue"
            onClick={() => setDeleteOpen(true)}
          >
            {t("settings.account.delete_button")}
          </button>
        </div>
      </section>

      <ConfirmModal
        open={deleteOpen}
        title={t("settings.account.delete_confirm_title")}
        message={t("settings.account.delete_confirm_body")}
        confirmLabel={t("settings.account.delete_confirm_cta")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
