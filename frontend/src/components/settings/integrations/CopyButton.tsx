/**
 * CopyButton — copies to the clipboard with "Copied" feedback.
 *
 * `getText` may be async (e.g. reveal the token before copying). If
 * `navigator.clipboard` does not exist (HTTP on the local network is not a secure context) it uses
 * the classic method with a hidden textarea.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { toast } from "../../../lib/toaster";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* falls back to the classic method */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  getText: () => string | null | Promise<string | null>;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export default function CopyButton({ getText, label, ariaLabel, disabled, className = "" }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onClick = useCallback(async () => {
    const text = await getText();
    if (text === null) return;
    if (await writeClipboard(text)) {
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("settings.integrations.copy_failed"));
    }
  }, [getText, t]);

  const text = copied ? t("settings.integrations.copied") : (label ?? t("settings.integrations.copy"));
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      className={`neo-btn neo-btn-sm ${className}`}
      onClick={() => void onClick()}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span aria-live="polite">{text}</span>
    </button>
  );
}
