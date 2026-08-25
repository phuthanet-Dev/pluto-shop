"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
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
          <DialogTitle>Logging out</DialogTitle>
        </div>
        <DialogDescription>Do you want to log out?</DialogDescription>
        <div className="logout-dialog-actions">
          <Link
            className="primary-button"
            href={`/api/auth/logout?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            prefetch={false}
          >
            Logout
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
