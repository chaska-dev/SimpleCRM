/**
 * RegisterForm — /register/ form (only mounted when `can_register`).
 *
 * Fields: name, email, password and confirmation. Does basic validation on the
 * client and shows backend errors per field, translated with i18n
 * (utils/apiErrors.ts). On account creation the backend logs in and sets the
 * preference cookies; then it goes to /welcome/ (language, theme and color).
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch, ApiError } from "../../lib/api";
import { useTranslation, withLang } from "../../i18n";
import { localizeApiError } from "../../utils/apiErrors";
import type { Lang } from "../../types";

interface Props {
  lang: Lang;
}

type Field = "name" | "email" | "password" | "confirm";
type Errors = Partial<Record<Field, string>>;

const MIN_PASSWORD = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Backend field -> form field. */
const BACKEND_FIELDS: Record<string, Field> = {
  first_name: "name",
  last_name: "name",
  email: "email",
  password: "password",
  password_confirm: "confirm",
};

function RegisterForm({ lang }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = t("auth.errors.name_required");
    if (!email.trim()) next.email = t("auth.errors.email_required");
    else if (!EMAIL_RE.test(email.trim())) next.email = t("auth.errors.email_invalid");
    if (password.length < MIN_PASSWORD) next.password = t("auth.errors.password_short");
    if (confirm !== password) next.confirm = t("auth.errors.confirm_mismatch");
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    // Full name -> first word as first name and the rest as last name.
    const trimmed = name.trim().replace(/\s+/g, " ");
    const [first, ...rest] = trimmed.split(" ");
    setBusy(true);
    try {
      await apiFetch("/api/auth/register/", {
        method: "POST",
        body: {
          email: email.trim(),
          first_name: first,
          last_name: rest.join(" "),
          password,
          password_confirm: confirm,
        },
      });
      // Full reload: the /welcome/ SSR needs to see the session and the new cookies.
      window.location.href = "/welcome/";
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 400 && err.payload && typeof err.payload === "object") {
        const payload = err.payload as Record<string, unknown>;
        const mapped: Errors = {};
        let leftover = false;
        for (const [key, value] of Object.entries(payload)) {
          const field = BACKEND_FIELDS[key];
          if (!field) {
            leftover = true;
            continue;
          }
          mapped[field] = mapped[field] ?? localizeApiError(400, value, lang);
        }
        setErrors(mapped);
        if (leftover || Object.keys(mapped).length === 0) setFormError(t("auth.errors.register_failed"));
        return;
      }
      // 403 (registration closed), network, 5xx: message already translated by apiFetch.
      setFormError(err instanceof Error && err.message ? err.message : t("auth.errors.register_failed"));
    }
  };

  const fieldProps = (field: Field, id: string) => ({
    id,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${id}-error` : undefined,
    disabled: busy,
    className: "neo-input",
  });

  const error = (field: Field, id: string) =>
    errors[field] ? (
      <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-accent" role="alert">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium">
          {t("auth.first_name")}
        </label>
        <input
          {...fieldProps("name", "register-name")}
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
        />
        {error("name", "register-name")}
      </div>

      <div>
        <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium">
          {t("auth.email")}
        </label>
        <input
          {...fieldProps("email", "register-email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error("email", "register-email")}
      </div>

      <div>
        <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium">
          {t("auth.password")}
        </label>
        <input
          {...fieldProps("password", "register-password")}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errors.password ? (
          error("password", "register-password")
        ) : (
          <p className="mt-1.5 text-xs text-fg-muted">{t("auth.password_hint")}</p>
        )}
      </div>

      <div>
        <label htmlFor="register-confirm" className="mb-1.5 block text-sm font-medium">
          {t("auth.password_confirm")}
        </label>
        <input
          {...fieldProps("confirm", "register-confirm")}
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error("confirm", "register-confirm")}
      </div>

      {formError && (
        <p className="text-sm font-medium text-accent" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" disabled={busy} aria-busy={busy} className="neo-btn neo-btn-primary w-full">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {t("auth.submit_register")}
      </button>
    </form>
  );
}

export default withLang(RegisterForm);
