"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type FeedbackDialogTone = "info" | "warning" | "danger" | "success";

type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  closeLabel: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: FeedbackDialogTone;
  busy?: boolean;
  busyLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

const iconByTone: Record<FeedbackDialogTone, string> = {
  info: "i",
  warning: "!",
  danger: "!",
  success: "✓",
};

export function FeedbackDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  confirmLabel,
  cancelLabel,
  tone = "info",
  busy = false,
  busyLabel,
  onConfirm,
}: FeedbackDialogProps) {
  const isConfirmation = typeof onConfirm === "function";

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
  }

  function handlePrimaryAction() {
    if (onConfirm) {
      void onConfirm();
      return;
    }
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="feedback-dialog" data-tone={tone}>
        <div className="feedback-dialog-topbar">
          <span className="feedback-dialog-icon" aria-hidden="true">
            {iconByTone[tone]}
          </span>
          <DialogClose asChild>
            <button
              className="feedback-dialog-close icon-button"
              type="button"
              aria-label={closeLabel}
              disabled={busy}
            >
              <span aria-hidden="true">×</span>
            </button>
          </DialogClose>
        </div>
        <div className="feedback-dialog-copy">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <div className="feedback-dialog-actions">
          {isConfirmation && cancelLabel ? (
            <button
              className="feedback-dialog-button feedback-dialog-button-secondary"
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            className={`feedback-dialog-button feedback-dialog-button-primary feedback-dialog-button-${tone}`}
            type="button"
            onClick={handlePrimaryAction}
            disabled={busy}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
