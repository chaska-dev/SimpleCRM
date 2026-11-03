/**
 * AiMark — discreet "AI" mark for objects created by an agent (MCP).
 * Only rendered if `createdVia === "mcp"`; meta text with a Bot icon.
 */
import { Bot } from "lucide-react";
import type { CreatedVia } from "../../types";
import { useTranslation } from "../../i18n";

interface Props {
  createdVia?: CreatedVia | null;
  className?: string;
}

export default function AiMark({ createdVia, className = "" }: Props) {
  const { t } = useTranslation();
  if (createdVia !== "mcp") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-fg-muted ${className}`}
      title={t("ai.title")}
    >
      <Bot className="size-3.5" aria-hidden="true" />
      <span>{t("ai.mark")}</span>
    </span>
  );
}
