"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SITE_BRAND_DISPLAY } from "@/lib/brand";
import { AdminProductsConsole } from "@/components/admin-products-console";
import { AdminFulfillmentConsole } from "@/components/admin-fulfillment-console";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";

export type AdminNavigationState = { dirty: boolean; busy: boolean };
export type AdminSelectedProduct = { id: number; nameTh: string };
type Destination = { section: "products" | "fulfillment"; product?: AdminSelectedProduct } | { href: string };

export function AdminWorkspace() {
  const [section, setSection] = useState<"products" | "fulfillment">("products");
  const [selectedProduct, setSelectedProduct] = useState<AdminSelectedProduct>();
  const [navigation, setNavigation] = useState<AdminNavigationState>({ dirty: false, busy: false });
  const [pending, setPending] = useState<Destination | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const reportNavigation = useCallback((state: AdminNavigationState) => setNavigation(state), []);
  useEffect(() => {
    if (!navigation.dirty && !navigation.busy) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [navigation.dirty, navigation.busy]);

  function go(destination: Destination) {
    if (navigation.busy) return;
    setPending(null);
    if ("href" in destination) {
      window.location.assign(destination.href);
      return;
    }
    setNavigation({ dirty: false, busy: false });
    setSelectedProduct(destination.product);
    setSection(destination.section);
    requestAnimationFrame(() => contentRef.current?.focus());
  }
  function requestNavigation(destination: Destination) {
    if (navigation.busy) return;
    if (navigation.dirty) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending(destination);
    } else go(destination);
  }
  function keepEditing() {
    if (navigation.busy) return;
    setPending(null);
    // This dialog is controlled, without a Radix Trigger to restore focus for us.
    requestAnimationFrame(() => {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus();
      else contentRef.current?.focus();
    });
  }

  return (
    <div className="admin-workspace">
      <header className="admin-workspace-header">
        <strong>{SITE_BRAND_DISPLAY} · หลังบ้าน</strong>
        <div>{[{ href: "/th", label: "ไปหน้าร้าน" }, { href: "/api/auth/logout?callbackUrl=%2Fth", label: "ออกจากระบบ" }].map(({ href, label }) => (
          <Link key={href} href={href} prefetch={false} aria-disabled={navigation.busy} onClick={(event) => { event.preventDefault(); requestNavigation({ href }); }}>{label}</Link>
        ))}</div>
      </header>
      <nav aria-label="ส่วนงานผู้ดูแล" className="admin-workspace-nav">
        <button type="button" aria-pressed={section === "products"} disabled={navigation.busy} onClick={() => { if (section !== "products") requestNavigation({ section: "products" }); }}>สินค้า</button>
        <button type="button" aria-pressed={section === "fulfillment"} disabled={navigation.busy} onClick={() => { if (section !== "fulfillment") requestNavigation({ section: "fulfillment" }); }}>การส่งมอบ</button>
      </nav>
      <div ref={contentRef} tabIndex={-1}>
        {section === "products" ? <AdminProductsConsole onNavigationStateChange={reportNavigation} onManageFulfillment={(product) => requestNavigation({ section: "fulfillment", product })} /> : <AdminFulfillmentConsole key={selectedProduct?.id ?? "manual"} initialProduct={selectedProduct} onNavigationStateChange={reportNavigation} />}
      </div>
      <FeedbackDialog open={pending !== null} onOpenChange={(open) => { if (!open) keepEditing(); }} title="ละทิ้งการแก้ไข?" description="ข้อมูลที่ยังไม่บันทึกจะหายไป การบันทึกหรืออัปโหลดที่เสร็จแล้วจะไม่ถูกย้อนกลับ" closeLabel="ปิดคำยืนยัน" cancelLabel="แก้ไขต่อ" confirmLabel="ละทิ้งการแก้ไข" tone="warning" busy={navigation.busy} onConfirm={() => { if (pending) go(pending); }} />
    </div>
  );
}
