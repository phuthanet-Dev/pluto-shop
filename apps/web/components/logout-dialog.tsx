"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LogoutDialogProps = {
  callbackUrl?: string;
};

export function LogoutDialog({ callbackUrl = "/th" }: LogoutDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="primary-button" type="button">
          Sign out
        </button>
      </DialogTrigger>
      <DialogContent className="logout-dialog">
        <div className="dialog-heading-row">
          <div>
            <p className="eyebrow">Pluto Shop / AUTH</p>
            <DialogTitle>Sign out of Pluto Shop</DialogTitle>
          </div>
          <DialogClose asChild>
            <button className="icon-button" type="button" aria-label="Close sign-out dialog">
              <span aria-hidden="true">×</span>
            </button>
          </DialogClose>
        </div>
        <DialogDescription>Your Pluto Shop session will be cleared on this device.</DialogDescription>
        <div className="logout-dialog-actions">
          <DialogClose asChild>
            <button className="secondary-button" type="button">
              Keep me signed in
            </button>
          </DialogClose>
          <Link
            className="primary-button"
            href={`/api/auth/logout?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            prefetch={false}
          >
            Sign out securely
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
