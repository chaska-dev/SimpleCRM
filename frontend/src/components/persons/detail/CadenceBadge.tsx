import type { CadenceStatus } from "../../../types";
import { STATUS_TOKENS } from "../../../styles/tokens";

interface Props {
  status: CadenceStatus;
  label: string;
}

/**
 * Pill badge for cadence_status. Reuses STATUS_TOKENS from the design system.
 * If the status is "no_cadence" → null (no badge).
 */
export default function CadenceBadge({ status, label }: Props) {
  if (status === "no_cadence") return null;
  const token = STATUS_TOKENS[status];
  if (!token) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${token.badge}`}
    >
      {label}
    </span>
  );
}