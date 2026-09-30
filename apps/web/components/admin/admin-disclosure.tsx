"use client";
import { useId, useState, type ReactNode } from "react";

/** Mounted disclosure for non-secret fields only. */
export function AdminDisclosure({ title, children, initiallyOpen = false, open: controlledOpen, onOpenChange }: {
  title: string; children: ReactNode; initiallyOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? localOpen;
  return <section className="admin-disclosure">
    <h3><button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setLocalOpen(!open); onOpenChange?.(!open); }}>{title}</button></h3>
    <div id={id} hidden={!open}>{children}</div>
  </section>;
}
