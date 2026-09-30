"use client";

import { useEffect, useRef, useState } from "react";
import { profileWriteSchema, profileValidationMessage } from "@/lib/fulfillment-profile-validation";
import { AdminSelect } from "@/components/admin/admin-select";
import { AdminDisclosure } from "@/components/admin/admin-disclosure";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";

import {
  addAdminInventory,
  fetchAdminFulfillmentProfile,
  fetchAdminInventory,
  importAdminInventory,
  markAdminFulfillmentReady,
  retryAdminFulfillment,
  revealAdminInventory,
  quarantineAdminInventory,
  revokeAdminInventory,
  updateAdminFulfillmentProfile,
  type AdminFulfillmentProfile,
  type AdminFulfillmentProfileWrite,
  type FulfillmentInventoryItem,
  type FulfillmentReveal,
  type FulfillmentStep,
  type FulfillmentStepWrite,
  type FulfillmentType,
  type SecureInventoryWrite,
} from "@/lib/admin-fulfillment";

const fulfillmentTypeOptions: ReadonlyArray<{ value: FulfillmentType; label: string; hideValue?: boolean }> = [
  { value: "NONE", label: "ยังไม่กำหนดข้อมูลส่งมอบ" },
  { value: "DISCORD_ACCOUNT", label: "อีเมล / รหัสผ่าน", hideValue: true },
  { value: "LICENSE_KEY", label: "คีย์สิทธิ์ใช้งาน (License key)" },
  { value: "INVITE_URL", label: "ลิงก์คำเชิญ (Invite URL)" },
  { value: "REDEEM_CODE", label: "รหัสแลกรับ (Redeem code)" },
  { value: "MANUAL_INSTRUCTION", label: "ขั้นตอนดำเนินการด้วยตนเอง" },
];

function emptyStep(): FulfillmentStepWrite {
  return {
    stepOrder: 1,
    audience: "CUSTOMER",
    titleTh: "",
    titleEn: "",
    bodyTh: "",
    bodyEn: "",
    linkUrl: null,
    enabled: true,
  };
}

function parseProductId(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fieldLabel(type: FulfillmentType): string {
  if (type === "LICENSE_KEY") return "คีย์สิทธิ์ใช้งาน (License key)";
  if (type === "INVITE_URL") return "ลิงก์คำเชิญ (Invite URL)";
  if (type === "REDEEM_CODE") return "รหัสแลกรับ (Redeem code)";
  return "ข้อมูลลับ";
}

function toInventoryRequest(
  type: FulfillmentType,
  provider: string,
  email: string,
  password: string,
  secretValue: string,
  region: string,
): SecureInventoryWrite | null {
  const publicMetadata: Record<string, string> = region.trim() ? { region: region.trim() } : {};
  if (type === "DISCORD_ACCOUNT") {
    return { fulfillmentType: type, provider, payload: { email, password }, publicMetadata };
  }
  if (type === "LICENSE_KEY") {
    return { fulfillmentType: type, provider, payload: { licenseKey: secretValue }, publicMetadata };
  }
  if (type === "INVITE_URL") {
    return { fulfillmentType: type, provider, payload: { inviteUrl: secretValue }, publicMetadata };
  }
  if (type === "REDEEM_CODE") {
    return { fulfillmentType: type, provider, payload: { code: secretValue }, publicMetadata };
  }
  return null;
}

function toStepWrite(step: FulfillmentStep): FulfillmentStepWrite {
  return {
    stepOrder: step.stepOrder,
    audience: step.audience,
    titleTh: step.titleTh,
    titleEn: step.titleEn,
    bodyTh: step.bodyTh,
    bodyEn: step.bodyEn,
    linkUrl: step.linkUrl,
    enabled: step.enabled,
  };
}

function toBulkInventoryRequests(
  type: FulfillmentType,
  provider: string,
  rawValues: string,
  region: string,
): SecureInventoryWrite[] | null {
  const lines = rawValues.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0 || lines.length > 100) return null;
  const publicMetadata: Record<string, string> = region.trim() ? { region: region.trim() } : {};
  if (type === "DISCORD_ACCOUNT") {
    const requests: SecureInventoryWrite[] = [];
    for (const line of lines) {
      const separator = line.indexOf("\t");
      if (separator <= 0 || separator === line.length - 1) return null;
      requests.push({
        fulfillmentType: type,
        provider,
        payload: { email: line.slice(0, separator), password: line.slice(separator + 1) },
        publicMetadata,
      });
    }
    return requests;
  }
  if (type === "LICENSE_KEY") return lines.map((licenseKey) => ({ fulfillmentType: type, provider, payload: { licenseKey }, publicMetadata }));
  if (type === "INVITE_URL") return lines.map((inviteUrl) => ({ fulfillmentType: type, provider, payload: { inviteUrl }, publicMetadata }));
  if (type === "REDEEM_CODE") return lines.map((code) => ({ fulfillmentType: type, provider, payload: { code }, publicMetadata }));
  return null;
}

export function AdminFulfillmentConsole({ initialProduct, onNavigationStateChange }: {
  initialProduct?: { id: number; nameTh: string };
  onNavigationStateChange?: (state: { dirty: boolean; busy: boolean }) => void;
} = {}) {
  const epoch = useRef(0);
  const [task, setTask] = useState<"setup" | "stock">("setup");
  const [inventoryToolsOpen, setInventoryToolsOpen] = useState(false);
  const [secretEditorOpen, setSecretEditorOpen] = useState(false);
  const [importMode, setImportMode] = useState<"single" | "batch">("single");
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [confirmation, setConfirmation] = useState<{ description: string; run: () => Promise<void> } | null>(null);
  const [loadedProductId, setLoadedProductId] = useState<number | null>(null);
  const [productIdText, setProductIdText] = useState(initialProduct ? String(initialProduct.id) : "");
  const [fulfillmentIdText, setFulfillmentIdText] = useState("");
  const [profile, setProfile] = useState<AdminFulfillmentProfile | null>(null);
  const [inventory, setInventory] = useState<FulfillmentInventoryItem[]>([]);
  const [type, setType] = useState<FulfillmentType>("NONE");
  const [provider, setProvider] = useState("");
  const [steps, setSteps] = useState<FulfillmentStepWrite[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [region, setRegion] = useState("");
  const [bulkValues, setBulkValues] = useState("");
  const [revealed, setRevealed] = useState<Record<number, FulfillmentReveal>>({});
  const [revealReason, setRevealReason] = useState("CUSTOMER_SUPPORT");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const productId = loadedProductId;
  useEffect(() => () => { epoch.current += 1; }, []);
  const secretDirty = Boolean(email || password || secretValue || bulkValues || region);
  const profileDirty = profile !== null && (type !== profile.fulfillmentType || provider !== (profile.provider ?? "") || JSON.stringify(steps) !== JSON.stringify(profile.steps.map(toStepWrite)));
  const dirty = secretDirty || profileDirty;
  useEffect(() => { onNavigationStateChange?.({ dirty, busy: busy || loading }); }, [dirty, busy, loading, onNavigationStateChange]);
  function clearSecrets() {
    setEmail(""); setPassword(""); setSecretValue(""); setBulkValues(""); setRegion(""); setRevealed({});
  }
  function requestDiscard(action: () => void, hasChanges = dirty) {
    if (busy) return;
    if (hasChanges) setPendingDiscard(() => action);
    else action();
  }
  function confirmAction(description: string, run: () => Promise<void>) {
    if (busy || loading) return;
    setConfirmation({ description, run });
  }
  function clearProduct() {
    epoch.current += 1;
    setTask("setup"); setInventoryToolsOpen(false);
    setSecretEditorOpen(false); setConfirmation(null);
    setLoadedProductId(null); setProfile(null); setInventory([]); setRevealed({});
    setEmail(""); setPassword(""); setSecretValue(""); setBulkValues(""); setRegion("");
    setType("NONE"); setProvider(""); setSteps([]); setLoading(false);
    setError(null); setNotice(null);
  }
  const fulfillmentId = parseProductId(fulfillmentIdText);
  const secureType = type !== "NONE" && type !== "MANUAL_INSTRUCTION";

  async function loadProduct() {
    if (busy) return;
    clearProduct();
    const requestEpoch = epoch.current;
    const productId = parseProductId(productIdText);
    setRevealed({});
    if (!productId) {
      setError("กรุณาระบุรหัสสินค้า (SKU) ที่ถูกต้อง");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    setRevealed({});
    try {
      const [loadedProfile, loadedInventory] = await Promise.all([
        fetchAdminFulfillmentProfile(productId),
        fetchAdminInventory(productId),
      ]);
      if (requestEpoch !== epoch.current) return;
      if (loadedProfile.productId !== productId) throw new Error("รหัสสินค้าในการตอบกลับไม่ตรงกับ SKU ที่ขอ");
      setLoadedProductId(productId);
      setProfile(loadedProfile);
      setType(loadedProfile.fulfillmentType);
      setProvider(loadedProfile.provider ?? "");
      setSteps(loadedProfile.steps.map(toStepWrite));
      setInventory(loadedInventory.items);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลด fulfillment ได้");
    } finally {
      if (requestEpoch === epoch.current) setLoading(false);
    }
  }

  async function saveProfile() {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!productId || !profile) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const request: AdminFulfillmentProfileWrite = {
      fulfillmentType: type,
      // Keep persisted provider identity; DISCORD is the legacy account storage tag.
      provider: type === "NONE" ? null : type === "DISCORD_ACCOUNT" ? (profile.fulfillmentType === type ? profile.provider : "DISCORD") : (provider.trim() ? provider : null),
      payloadSchemaVersion: 1,
      version: profile.version,
      steps,
    };
    const validation = profileWriteSchema.safeParse(request);
    if (!validation.success) {
      setError(validation.error.issues.map((issue) => profileValidationMessage(issue.path)).join(" • "));
      setBusy(false);
      return;
    }
    try {
      const saved = await updateAdminFulfillmentProfile(productId, request);
      if (requestEpoch !== epoch.current) return;
      if (saved.productId !== productId) throw new Error("รหัสสินค้าในการตอบกลับไม่ตรงกับ SKU ที่บันทึก กรุณาโหลดใหม่");
      setProfile(saved);
      setType(saved.fulfillmentType);
      setProvider(saved.provider ?? "");
      setSteps(saved.steps.map(toStepWrite));
      setNotice("บันทึก fulfillment profile แล้ว");
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถบันทึก fulfillment profile ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function addInventoryItem() {
    if (busy || loading || profileDirty) return;
    const requestEpoch = epoch.current;
    if (!productId || !secureType || !profile) return;
    const request = toInventoryRequest(type, provider, email, password, secretValue, region);
    if (!request) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await addAdminInventory(productId, request);
      if (requestEpoch !== epoch.current) return;
      // The write committed independently of the summary refresh.
      clearSecrets();
      setNotice("บันทึกข้อมูลส่งมอบแล้ว หากโหลดสรุปไม่สำเร็จให้โหลดใหม่ ไม่ต้องเพิ่มซ้ำ");
      const [loadedProfile, loadedInventory] = await Promise.all([
        fetchAdminFulfillmentProfile(productId),
        fetchAdminInventory(productId),
      ]);
      if (requestEpoch !== epoch.current) return;
      setProfile(loadedProfile);
      setInventory(loadedInventory.items);
      setEmail("");
      setPassword("");
      setSecretValue("");
      setNotice("เพิ่ม inventory แบบเข้ารหัสแล้ว");
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเพิ่ม inventory ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function importInventoryBatch() {
    if (busy || loading || profileDirty) return;
    const requestEpoch = epoch.current;
    if (!productId || !secureType || !profile) return;
    const requests = toBulkInventoryRequests(type, provider, bulkValues, region);
    if (!requests) {
      setError("รูปแบบ batch ไม่ถูกต้อง หรือมีจำนวนเกิน 100 รายการ");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const loadedInventory = await importAdminInventory(productId, requests);
      if (requestEpoch !== epoch.current) return;
      // The import has committed even when the following summary refresh fails.
      clearSecrets();
      setNotice(`นำเข้าข้อมูล ${requests.length} รายการแล้ว ไม่ต้องนำเข้าซ้ำ`);
      setInventory(loadedInventory.items);
      const loadedProfile = await fetchAdminFulfillmentProfile(productId);
      if (requestEpoch !== epoch.current) return;
      setProfile(loadedProfile);
      setInventory(loadedInventory.items);
      setBulkValues("");
      setNotice(`นำเข้า inventory ${requests.length} รายการแบบเข้ารหัสแล้ว`);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถนำเข้า inventory ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function revealItem(item: FulfillmentInventoryItem) {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!productId || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const result = await revealAdminInventory(productId, item.id, revealReason);
      if (requestEpoch !== epoch.current) return;
      if (result.inventoryItemId !== item.id || result.fulfillmentType !== item.fulfillmentType || result.provider !== item.provider) {
        throw new Error("ข้อมูลตอบกลับไม่ตรงกับรายการที่ขอเปิดเผย");
      }
      setRevealed((current) => ({ ...current, [item.id]: result }));
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดเผยข้อมูลรายการได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function revokeItem(item: FulfillmentInventoryItem) {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!productId || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await revokeAdminInventory(productId, item.id, revealReason);
      if (requestEpoch !== epoch.current) return;
      setRevealed({});
      setInventory((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      setNotice(`ยกเลิก inventory #${item.id} แล้ว`);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถยกเลิก inventory ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function markManualFulfillmentReady() {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!fulfillmentId) {
      setError("กรุณาระบุรหัส fulfillment ที่ถูกต้อง");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await markAdminFulfillmentReady(fulfillmentId);
      if (requestEpoch !== epoch.current) return;
      setNotice(`manual fulfillment #${result.fulfillmentId} พร้อมส่งมอบแล้ว`);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเตรียม manual fulfillment ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function quarantineItem(item: FulfillmentInventoryItem) {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!productId || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await quarantineAdminInventory(productId, item.id, revealReason);
      if (requestEpoch !== epoch.current) return;
      setRevealed({});
      setInventory((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      setNotice(`กักกัน inventory #${item.id} แล้ว`);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถกักกัน inventory ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  async function retryFulfillment() {
    if (busy || loading) return;
    const requestEpoch = epoch.current;
    if (!fulfillmentId) {
      setError("กรุณาระบุรหัส fulfillment ที่ถูกต้อง");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await retryAdminFulfillment(fulfillmentId);
      if (requestEpoch !== epoch.current) return;
      setNotice(`เริ่ม retry fulfillment #${result.fulfillmentId} แล้ว`);
    } catch (caught) {
      if (requestEpoch !== epoch.current) return;
      setError(caught instanceof Error ? caught.message : "ไม่สามารถ retry fulfillment ได้");
    } finally {
      if (requestEpoch === epoch.current) setBusy(false);
    }
  }

  function switchTask(next: "setup" | "stock") {
    if (next === task || busy || loading || (next === "stock" && profileDirty)) return;
    requestDiscard(() => {
      clearSecrets(); setSecretEditorOpen(false); setInventoryToolsOpen(false); setTask(next);
    }, secretDirty);
  }

  return (
    <section className="admin-fulfillment-console" aria-labelledby="admin-fulfillment-title">
      <div className="admin-section-heading">
        <div>
          <h1 id="admin-fulfillment-title">{productId ? `การส่งมอบ: ${initialProduct?.id === productId ? initialProduct.nameTh : "สินค้า"} · SKU #${productId}` : "การส่งมอบ"}</h1>
          <p>เริ่มที่เมนูสินค้า → เปิดสินค้าที่ต้องการ → จัดการการส่งมอบ แล้วโหลดข้อมูลด้านล่าง</p>
        </div>
      </div>

      {!profile ? <div className="admin-fulfillment-guide">
        <h2>1. เลือกสินค้า</h2>
        <p>{initialProduct && initialProduct.id === parseProductId(productIdText) ? `เลือกแล้ว: ${initialProduct.nameTh} · SKU #${initialProduct.id}` : "เลือกจากเมนูสินค้าเพื่อไม่ต้องจำรหัส หรือระบุ SKU ที่ทราบด้านล่าง"}</p>
        <p>2. ตั้งค่าสิ่งที่ลูกค้าได้รับ → 3. เติมคลังส่งมอบ</p>
      </div> : null}
      <div className="admin-fulfillment-loader">
        <label htmlFor="admin-fulfillment-product-id">รหัสสินค้า (SKU)</label>
        <input
          id="admin-fulfillment-product-id"
          disabled={busy || confirmation !== null}
          value={productIdText}
          onChange={(event) => {
            if (busy) return;
            const value = event.target.value;
            requestDiscard(() => { clearProduct(); setProductIdText(value); });
          }}
          inputMode="numeric"
          placeholder="เช่น 37"
        />
        <button type="button" className="primary-button" onClick={() => requestDiscard(() => void loadProduct())} disabled={busy || loading}>
          {loading ? "กำลังโหลด…" : "โหลดการส่งมอบ"}
        </button>
      </div>

      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-form-notice" role="status">{notice}</p> : null}

      <FeedbackDialog open={pendingDiscard !== null} onOpenChange={(open) => { if (!open) setPendingDiscard(null); }} title="ละทิ้งการแก้ไข?" description="ข้อมูลที่ยังไม่บันทึกและข้อมูลลับในส่วนที่ปิดจะถูกล้าง การบันทึกที่เสร็จแล้วจะไม่ถูกย้อนกลับ" closeLabel="ปิดคำยืนยัน" cancelLabel="แก้ไขต่อ" confirmLabel="ละทิ้งการแก้ไข" tone="warning" busy={busy} onConfirm={() => { if (!busy) { pendingDiscard?.(); setPendingDiscard(null); } }} />
      <FeedbackDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }} title="ยืนยันการดำเนินการ" description={confirmation?.description ?? ""} closeLabel="ปิดคำยืนยัน" cancelLabel="ยกเลิกการดำเนินการ" confirmLabel="ยืนยันดำเนินการ" tone="warning" busy={busy} onConfirm={async () => { if (!busy) { await confirmation?.run(); setConfirmation(null); } }} />
      <fieldset className="admin-form-fields" disabled={busy || loading}>
      {profile ? (
        <div className="admin-fulfillment-workflow">
          <div className="admin-fulfillment-task-nav" role="group" aria-label="งานส่งมอบของสินค้า">
            <button type="button" aria-pressed={task === "setup"} onClick={() => switchTask("setup")}>ตั้งค่าสิ่งที่ลูกค้าได้รับ</button>
            <button type="button" aria-pressed={task === "stock"} disabled={profileDirty} onClick={() => switchTask("stock")}>จัดการคลังส่งมอบ</button>
          </div>
          <p className="admin-fulfillment-muted">ชำระเงินสำเร็จไม่ได้แปลว่าส่งมอบแล้ว วิธีส่งทันทีหรือให้ผู้ดูแลตรวจสอบตั้งค่าที่เมนูสินค้า ไม่ใช่ชนิดข้อมูลด้านล่าง</p>
          {profileDirty ? <p className="admin-fulfillment-prerequisite" role="status">บันทึกรูปแบบการส่งมอบก่อนเพิ่มข้อมูลเข้าคลัง</p> : null}
          <div className="admin-fulfillment-grid" data-task={task}>
          <div className="admin-fulfillment-main">
            <section className="admin-fulfillment-card" hidden={task !== "setup"} aria-labelledby="admin-fulfillment-profile-title">
              <div className="admin-card-heading">
                <div>
                  <h3 id="admin-fulfillment-profile-title">2. ตั้งค่าสิ่งที่ลูกค้าได้รับ</h3>
                </div>
                <span className="admin-fulfillment-version">v{profile.version}</span>
              </div>
              <p className="admin-fulfillment-muted">เลือกว่าแต่ละรายการจะมอบบัญชี คีย์ ลิงก์ หรือคำแนะนำให้ลูกค้า แล้วบันทึกก่อนเติมคลัง</p>
              <AdminSelect disabled={busy || loading || task !== "setup"} label="ชนิดข้อมูลที่ลูกค้าได้รับ" value={type} options={fulfillmentTypeOptions} onChange={(value) => requestDiscard(() => { clearSecrets(); setType(value); }, secretDirty)} />
              {type !== "DISCORD_ACCOUNT" ? <>
                <label htmlFor="admin-fulfillment-provider">ผู้ให้บริการ</label>
                <input id="admin-fulfillment-provider" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="รหัสผู้ให้บริการ" />
              </> : null}

              <AdminDisclosure title="คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล">
              <div className="admin-fulfillment-steps-heading">
                <div>
                  <h4>ขั้นตอนสำหรับลูกค้าและผู้ดูแล</h4>
                  <p>ขั้นตอนจะถูกบันทึกเป็นสำเนาเมื่อสร้างคำสั่งซื้อ โดยไม่รวมข้อมูลลับ</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setSteps((current) => [...current, { ...emptyStep(), stepOrder: current.length + 1 }])}>
                  เพิ่มขั้นตอน
                </button>
              </div>
              <div className="admin-fulfillment-steps">
                {steps.map((step, index) => (
                  <fieldset className="admin-fulfillment-step" key={`${step.audience}-${index}`}>
                    <legend>ขั้นตอนที่ {index + 1}</legend>
                    <AdminSelect disabled={busy || loading} label={`ผู้เห็นขั้นตอนที่ ${index + 1}`} value={step.audience} options={[{ value: "CUSTOMER", label: "ลูกค้า" }, { value: "OPERATOR", label: "ผู้ดูแล" }]} onChange={(value) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, audience: value } : candidate))} />
                    <label htmlFor={`fulfillment-step-title-th-${index}`}>หัวข้อไทย</label>
                    <input id={`fulfillment-step-title-th-${index}`} value={step.titleTh} onChange={(event) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, titleTh: event.target.value } : candidate))} />
                    <label htmlFor={`fulfillment-step-title-en-${index}`}>หัวข้ออังกฤษ</label>
                    <input id={`fulfillment-step-title-en-${index}`} value={step.titleEn} onChange={(event) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, titleEn: event.target.value } : candidate))} />
                    <label htmlFor={`fulfillment-step-body-th-${index}`}>รายละเอียดไทย</label>
                    <textarea id={`fulfillment-step-body-th-${index}`} value={step.bodyTh} onChange={(event) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, bodyTh: event.target.value } : candidate))} />
                    <label htmlFor={`fulfillment-step-body-en-${index}`}>รายละเอียดอังกฤษ</label>
                    <textarea id={`fulfillment-step-body-en-${index}`} value={step.bodyEn} onChange={(event) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, bodyEn: event.target.value } : candidate))} />
                    <button type="button" className="text-button" onClick={() => setSteps((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}>ลบขั้นตอน</button>
                  </fieldset>
                ))}
              </div>
              </AdminDisclosure>
              <button type="button" className="primary-button" onClick={saveProfile} disabled={busy || loading}>บันทึกการส่งมอบ</button>
            </section>

            <section className="admin-fulfillment-card" hidden={task !== "stock"} aria-labelledby="admin-fulfillment-inventory-title">
              <div className="admin-card-heading">
                <div>
                  <h3 id="admin-fulfillment-inventory-title">3. เติมคลังส่งมอบ</h3>
                </div>
                <span className="admin-fulfillment-count">พร้อมส่งมอบ {profile.availableCount}</span>
              </div>
              <p aria-label="รูปแบบที่บันทึกแล้ว">{fulfillmentTypeOptions.find((option) => option.value === profile.fulfillmentType)?.label}{profile.provider ? ` · ${profile.provider}` : ""}</p>
              <p className="admin-fulfillment-muted">คลังนี้เก็บข้อมูลที่ลูกค้าจะได้รับ แยกจากจำนวนสต็อกในเมนูสินค้า ใช้รูปแบบที่บันทึกแล้วเท่านั้น</p>
              {secureType ? <button type="button" className="secondary-button" aria-expanded={secretEditorOpen} onClick={() => {
                if (secretEditorOpen) requestDiscard(() => { clearSecrets(); setSecretEditorOpen(false); }, secretDirty);
                else setSecretEditorOpen(true);
              }}>{secretEditorOpen ? "ปิดเพิ่มข้อมูลส่งมอบ" : "เปิดเพิ่มข้อมูลส่งมอบ"}</button> : null}
              {!secureType ? (
                <p className="admin-fulfillment-muted">ชนิดนี้ไม่มีคลังข้อมูลลับ ให้ตั้งค่ารูปแบบและขั้นตอนสำหรับลูกค้าแทน</p>
              ) : secretEditorOpen ? (
                <div className="admin-fulfillment-secret-form">
                  {profileDirty ? <p className="admin-fulfillment-muted">บันทึกรูปแบบการส่งมอบก่อนเพิ่มข้อมูลเข้าคลัง</p> : null}
                  <div className="admin-import-mode" role="group" aria-label="รูปแบบการเพิ่มข้อมูล">
                    <button type="button" aria-pressed={importMode === "single"} onClick={() => { if (importMode !== "single") requestDiscard(() => { clearSecrets(); setImportMode("single"); }, secretDirty); }}>ทีละรายการ</button>
                    <button type="button" aria-pressed={importMode === "batch"} onClick={() => { if (importMode !== "batch") requestDiscard(() => { clearSecrets(); setImportMode("batch"); }, secretDirty); }}>หลายรายการ</button>
                  </div>
                  <label htmlFor="fulfillment-region">ภูมิภาค (ข้อมูลไม่ลับ)</label>
                  <input id="fulfillment-region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="เช่น GLOBAL" />
                  {importMode === "single" ? <>
                  {type === "DISCORD_ACCOUNT" ? (
                    <>
                      <label htmlFor="fulfillment-email">อีเมล</label>
                      <input id="fulfillment-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
                      <label htmlFor="fulfillment-password">รหัสผ่าน</label>
                      <input id="fulfillment-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                    </>
                  ) : (
                    <>
                      <label htmlFor="fulfillment-secret-value">{fieldLabel(type)}</label>
                      <input id="fulfillment-secret-value" type={type === "INVITE_URL" ? "url" : "password"} value={secretValue} onChange={(event) => setSecretValue(event.target.value)} autoComplete="off" />
                    </>
                  )}

                  <button type="button" className="primary-button" onClick={addInventoryItem} disabled={busy || loading || profileDirty}>เพิ่มข้อมูลส่งมอบ</button>
                  </> : <>
                  <label htmlFor="fulfillment-bulk-values">นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)</label>
                  <textarea
                    id="fulfillment-bulk-values"
                    value={bulkValues}
                    onChange={(event) => setBulkValues(event.target.value)}
                    placeholder={type === "DISCORD_ACCOUNT" ? "email<TAB>password" : "ค่าลับหนึ่งค่าต่อหนึ่งบรรทัด"}
                    autoComplete="off"
                  />
                  <p className="admin-fulfillment-muted">อีเมล / รหัสผ่าน ใช้ TAB คั่นอีเมลกับรหัสผ่าน; ระบบจะ validate ทุกบรรทัดและไม่เก็บข้อมูลนี้ใน browser storage</p>
                  <button type="button" className="secondary-button" onClick={importInventoryBatch} disabled={busy || loading || profileDirty}>นำเข้าหลายรายการ</button>
                  </>}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="admin-fulfillment-sidebar" hidden={task !== "stock"}>
            <section className="admin-fulfillment-card" aria-labelledby="admin-fulfillment-list-title">
              <div className="admin-card-heading">
                <div>
                  <h3 id="admin-fulfillment-list-title">คลังข้อมูลส่งมอบ</h3>
                </div>
                <span className="admin-fulfillment-count">ทั้งหมด {inventory.length}</span>
              </div>
              <p className="admin-fulfillment-muted">รายการนี้แสดงเฉพาะข้อมูลทั่วไป ไม่ถอดรหัสหรือแสดงข้อมูลที่เข้ารหัส</p>
              <AdminDisclosure title="ตรวจสอบรายการและข้อมูลลับ" open={inventoryToolsOpen} onOpenChange={(open) => { if (!busy && !loading) { setRevealed({}); setInventoryToolsOpen(open); } }}>
              {inventoryToolsOpen ? <>
              <p className="admin-fulfillment-muted">เลือกเหตุผลก่อนเปิดเผย กักกัน หรือยกเลิก การดำเนินการจะถูกบันทึกเพื่อตรวจสอบย้อนหลัง</p>
              <AdminSelect disabled={busy || loading} label="เหตุผลเมื่อเปิดเผยข้อมูลลับ" value={revealReason} onChange={setRevealReason} options={[{ value: "CUSTOMER_SUPPORT", label: "บริการลูกค้า" }, { value: "INCIDENT_RESPONSE", label: "ตอบสนองเหตุการณ์" }, { value: "INVENTORY_AUDIT", label: "ตรวจสอบคลังข้อมูล" }, { value: "FULFILLMENT_RECOVERY", label: "กู้คืนการส่งมอบ" }]} />
              <div className="admin-fulfillment-inventory-list">
                {inventory.length === 0 ? <p className="admin-fulfillment-empty">ยังไม่มีข้อมูลส่งมอบ — หากใช้บัญชี คีย์ ลิงก์ หรือรหัส ให้เปิดเพิ่มข้อมูลส่งมอบเพื่อเริ่มเติมคลัง</p> : null}
                {inventory.map((item) => (
                  <article className="admin-fulfillment-inventory-item" key={item.id}>
                    <div className="admin-fulfillment-item-topline">
                      <strong>#{item.id}</strong>
                      <span className={`admin-status-pill admin-status-${item.status.toLowerCase()}`}>{{ AVAILABLE: "พร้อมส่งมอบ", RESERVED: "สำรองแล้ว", DELIVERED: "ส่งมอบแล้ว", REVOKED: "ยกเลิกแล้ว", QUARANTINED: "กักกัน" }[item.status]}</span>
                    </div>
                    <span>{fulfillmentTypeOptions.find((option) => option.value === item.fulfillmentType)?.label} · {item.provider}</span>
                    <span className="admin-fulfillment-metadata">{Object.entries(item.publicMetadata).map(([key, value]) => `${key}: ${value}`).join(" · ") || "ไม่มีข้อมูลทั่วไปที่แสดงได้"}</span>
                    <div className="admin-fulfillment-item-actions">
                      {revealed[item.id] ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setRevealed((current) => {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          })}
                          disabled={busy || loading}
                        >ซ่อนข้อมูล</button>
                      ) : <button type="button" className="secondary-button" onClick={() => revealItem(item)} disabled={busy || loading} aria-label={`เปิดเผยข้อมูลรายการ ${item.id}`}>เปิดเผย</button>}
                      {item.status === "AVAILABLE" ? <button type="button" className="text-button" onClick={() => confirmAction(`กักกัน SKU #${productId} · รายการ #${item.id} เพื่อหยุดการจัดสรรรายการนี้`, () => quarantineItem(item))} disabled={busy || loading}>กักกัน</button> : null}
                      {(item.status === "AVAILABLE" || item.status === "QUARANTINED") ? <button type="button" className="text-button danger" onClick={() => confirmAction(`ยกเลิก SKU #${productId} · รายการ #${item.id} รายการนี้จะไม่พร้อมส่งมอบ`, () => revokeItem(item))} disabled={busy || loading}>ยกเลิก</button> : null}
                    </div>
                    {revealed[item.id] ? <div className="admin-fulfillment-reveal" role="status"><span>เปิดเผยตามคำขอแล้ว</span>{Object.entries(revealed[item.id].fields).map(([key, value]) => <div key={key}><b>{key}</b><code>{value}</code></div>)}</div> : null}
                  </article>
                ))}
              </div>
              </> : null}
              </AdminDisclosure>
            </section>
          </aside>
          </div>
        </div>
      ) : null}

      <AdminDisclosure title="เครื่องมือแก้ปัญหาการส่งมอบ"><section className="admin-fulfillment-card admin-manual-ready-card" aria-labelledby="admin-manual-ready-title">
        <div className="admin-card-heading">
          <div>
            <h3 id="admin-manual-ready-title">ส่งมอบรายการที่ต้องตรวจด้วยตนเอง</h3>
          </div>
        </div>
        <p className="admin-fulfillment-muted">ใช้รหัสรายการส่งมอบ ไม่ใช่รหัสสินค้า สำหรับคำสั่งซื้อที่ชำระเงินแล้ว การยืนยันพร้อมส่งมอบใช้กับงานที่ผู้ดูแลตรวจสอบเท่านั้น ระบบจะตรวจสิทธิ์และสถานะอีกครั้ง</p>
        <label htmlFor="admin-manual-fulfillment-id">รหัส fulfillment สำหรับ manual</label>
        <input
          id="admin-manual-fulfillment-id"
          value={fulfillmentIdText}
          onChange={(event) => setFulfillmentIdText(event.target.value)}
          inputMode="numeric"
          placeholder="เช่น 88"
        />
        <div className="admin-fulfillment-item-actions">
          <button type="button" className="primary-button" onClick={() => confirmAction(`ยืนยัน fulfillment #${fulfillmentId} พร้อมส่งมอบ ระบบจะตรวจสอบคำสั่งซื้ออีกครั้ง`, markManualFulfillmentReady)} disabled={busy || loading}>ยืนยันพร้อมส่งมอบ</button>
          <button type="button" className="secondary-button" onClick={() => confirmAction(`ลองส่งมอบ fulfillment #${fulfillmentId} ซ้ำ ระบบจะตรวจสอบสถานะก่อนดำเนินการ`, retryFulfillment)} disabled={busy || loading}>ลองส่งมอบซ้ำ</button>
        </div>
      </section></AdminDisclosure>
      </fieldset>
    </section>
  );
}
