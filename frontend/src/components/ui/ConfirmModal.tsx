import { useState } from "react";
import Modal from "../persons/detail/Modal";
import { useTranslation } from "../../i18n";

interface Props {
  open: boolean;
  title: string;
  message: string;
  /** Defaults to `common.confirm`. */
  confirmLabel?: string;
  /** Defaults to `common.cancel`. */
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Generic, single confirm modal for the app (deletions, undo, revoke, etc.).
 * The confirm button is destructive (bg-accent, danger red) if `destructive` is set.
 * `onConfirm` may be async: while it resolves, the buttons are disabled
 * (or controlled from outside with `busy`).
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [internalBusy, setInternalBusy] = useState(false);
  const isBusy = busy ?? internalBusy;

  const handleConfirm = async () => {
    if (isBusy) return;
    setInternalBusy(true);
    try {
      await onConfirm();
    } finally {
      setInternalBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="neo-btn"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={`neo-btn ${destructive ? "neo-btn-danger" : "neo-btn-primary"}`}
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy ? "…" : (confirmLabel ?? t("common.confirm"))}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">{message}</p>
    </Modal>
  );
}