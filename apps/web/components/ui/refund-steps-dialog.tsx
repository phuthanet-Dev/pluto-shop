"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type RefundStep = {
  title: string;
  description: string;
  tone: "blue" | "violet" | "green";
};

type RefundStepsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  warning: string;
  steps: readonly RefundStep[];
  note: string;
  closeLabel: string;
  understoodLabel: string;
};

export function RefundStepsDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  warning,
  steps,
  note,
  closeLabel,
  understoodLabel,
}: RefundStepsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="refund-steps-dialog">
        <div className="refund-steps-hero">
          <DialogClose asChild>
            <button className="refund-steps-close" type="button" aria-label={closeLabel}>
              <span aria-hidden="true">×</span>
            </button>
          </DialogClose>
          <span className="refund-steps-icon" aria-hidden="true">i</span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </div>
        <div className="refund-steps-body">
          <div className="refund-steps-warning" role="note">
            <span className="refund-steps-warning-icon" aria-hidden="true">!</span>
            <p>{warning}</p>
          </div>
          <ol className="refund-steps-list">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className={`refund-step-number refund-step-number-${step.tone}`} aria-hidden="true">
                  {index + 1}
                </span>
                <div className="refund-step-copy">
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="refund-steps-note" role="note">
            <span className="refund-steps-note-icon" aria-hidden="true">✦</span>
            <p>{note}</p>
          </div>
        </div>
        <div className="refund-steps-footer">
          <button className="refund-steps-understood" type="button" onClick={() => onOpenChange(false)}>
            {understoodLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
