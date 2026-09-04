"use client";

import { useState } from "react";

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

const fulfillmentTypeOptions: ReadonlyArray<{ value: FulfillmentType; label: string }> = [
  { value: "NONE", label: "ไม่มี fulfillment อัตโนมัติ" },
  { value: "DISCORD_ACCOUNT", label: "Discord account (email/password)" },
  { value: "LICENSE_KEY", label: "License key" },
  { value: "INVITE_URL", label: "Invite URL" },
  { value: "REDEEM_CODE", label: "Redeem code" },
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
  if (type === "LICENSE_KEY") return "License key";
  if (type === "INVITE_URL") return "Invite URL";
  if (type === "REDEEM_CODE") return "Redeem code";
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

export function AdminFulfillmentConsole() {
  const [productIdText, setProductIdText] = useState("");
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

  const productId = parseProductId(productIdText);
  const fulfillmentId = parseProductId(fulfillmentIdText);
  const secureType = type !== "NONE" && type !== "MANUAL_INSTRUCTION";

  async function loadProduct() {
    setRevealed({});
    if (!productId) {
      setError("กรุณาระบุรหัสสินค้า/child ที่ถูกต้อง");
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
      setProfile(loadedProfile);
      setType(loadedProfile.fulfillmentType);
      setProvider(loadedProfile.provider ?? "");
      setSteps(loadedProfile.steps.map(toStepWrite));
      setInventory(loadedInventory.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลด fulfillment ได้");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!productId || !profile) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const request: AdminFulfillmentProfileWrite = {
      fulfillmentType: type,
      provider: type === "NONE" ? null : provider,
      payloadSchemaVersion: 1,
      version: profile.version,
      steps,
    };
    try {
      const saved = await updateAdminFulfillmentProfile(productId, request);
      setProfile(saved);
      setType(saved.fulfillmentType);
      setProvider(saved.provider ?? "");
      setSteps(saved.steps.map(toStepWrite));
      setNotice("บันทึก fulfillment profile แล้ว");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถบันทึก fulfillment profile ได้");
    } finally {
      setBusy(false);
    }
  }

  async function addInventoryItem() {
    if (!productId || !secureType || !profile) return;
    const request = toInventoryRequest(type, provider, email, password, secretValue, region);
    if (!request) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await addAdminInventory(productId, request);
      const [loadedProfile, loadedInventory] = await Promise.all([
        fetchAdminFulfillmentProfile(productId),
        fetchAdminInventory(productId),
      ]);
      setProfile(loadedProfile);
      setInventory(loadedInventory.items);
      setEmail("");
      setPassword("");
      setSecretValue("");
      setNotice("เพิ่ม inventory แบบเข้ารหัสแล้ว");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเพิ่ม inventory ได้");
    } finally {
      setBusy(false);
    }
  }

  async function importInventoryBatch() {
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
      const [loadedInventory, loadedProfile] = await Promise.all([
        importAdminInventory(productId, requests),
        fetchAdminFulfillmentProfile(productId),
      ]);
      setProfile(loadedProfile);
      setInventory(loadedInventory.items);
      setBulkValues("");
      setNotice(`นำเข้า inventory ${requests.length} รายการแบบเข้ารหัสแล้ว`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถนำเข้า inventory ได้");
    } finally {
      setBusy(false);
    }
  }

  async function revealItem(item: FulfillmentInventoryItem) {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await revealAdminInventory(productId, item.id, revealReason);
      setRevealed((current) => ({ ...current, [item.id]: result }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดเผยข้อมูลรายการได้");
    } finally {
      setBusy(false);
    }
  }

  async function revokeItem(item: FulfillmentInventoryItem) {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await revokeAdminInventory(productId, item.id, revealReason);
      setInventory((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      setNotice(`ยกเลิก inventory #${item.id} แล้ว`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถยกเลิก inventory ได้");
    } finally {
      setBusy(false);
    }
  }

  async function markManualFulfillmentReady() {
    if (!fulfillmentId) {
      setError("กรุณาระบุรหัส fulfillment ที่ถูกต้อง");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await markAdminFulfillmentReady(fulfillmentId);
      setNotice(`manual fulfillment #${result.fulfillmentId} พร้อมส่งมอบแล้ว`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเตรียม manual fulfillment ได้");
    } finally {
      setBusy(false);
    }
  }

  async function quarantineItem(item: FulfillmentInventoryItem) {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await quarantineAdminInventory(productId, item.id, revealReason);
      setInventory((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      setNotice(`กักกัน inventory #${item.id} แล้ว`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถกักกัน inventory ได้");
    } finally {
      setBusy(false);
    }
  }

  async function retryFulfillment() {
    if (!fulfillmentId) {
      setError("กรุณาระบุรหัส fulfillment ที่ถูกต้อง");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await retryAdminFulfillment(fulfillmentId);
      setNotice(`เริ่ม retry fulfillment #${result.fulfillmentId} แล้ว`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถ retry fulfillment ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-fulfillment-console" aria-labelledby="admin-fulfillment-title">
      <div className="admin-section-heading">
        <div>
          <span className="admin-eyebrow">SECURE DELIVERY</span>
          <h2 id="admin-fulfillment-title">Fulfillment ของสินค้า / child</h2>
          <p>กำหนดรูปแบบข้อมูลต่อ SKU และจัดการ inventory ที่เข้ารหัสแยกจาก catalog</p>
        </div>
      </div>

      <div className="admin-fulfillment-loader">
        <label htmlFor="admin-fulfillment-product-id">รหัสสินค้า/child</label>
        <input
          id="admin-fulfillment-product-id"
          value={productIdText}
          onChange={(event) => {
            setProductIdText(event.target.value);
            setRevealed({});
          }}
          inputMode="numeric"
          placeholder="เช่น 37"
        />
        <button type="button" className="primary-button" onClick={loadProduct} disabled={loading}>
          {loading ? "กำลังโหลด…" : "โหลดข้อมูล fulfillment"}
        </button>
      </div>

      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-form-notice" role="status">{notice}</p> : null}

      {profile ? (
        <div className="admin-fulfillment-grid">
          <div className="admin-fulfillment-main">
            <section className="admin-fulfillment-card" aria-labelledby="admin-fulfillment-profile-title">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-eyebrow">PROFILE</span>
                  <h3 id="admin-fulfillment-profile-title">รูปแบบข้อมูลและขั้นตอน</h3>
                </div>
                <span className="admin-fulfillment-version">v{profile.version}</span>
              </div>
              <label htmlFor="admin-fulfillment-type">ชนิด fulfillment</label>
              <select id="admin-fulfillment-type" value={type} onChange={(event) => setType(event.target.value as FulfillmentType)}>
                {fulfillmentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label htmlFor="admin-fulfillment-provider">Provider</label>
              <input id="admin-fulfillment-provider" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="เช่น DISCORD" />

              <div className="admin-fulfillment-steps-heading">
                <div>
                  <h4>Customer steps / Operator steps</h4>
                  <p>ขั้นตอนจะถูก snapshot ตอนสร้าง order และจะไม่รวมข้อมูลลับ</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setSteps((current) => [...current, { ...emptyStep(), stepOrder: current.length + 1 }])}>
                  เพิ่มขั้นตอน
                </button>
              </div>
              <div className="admin-fulfillment-steps">
                {steps.map((step, index) => (
                  <fieldset className="admin-fulfillment-step" key={`${step.audience}-${index}`}>
                    <legend>ขั้นตอนที่ {index + 1}</legend>
                    <label htmlFor={`fulfillment-step-audience-${index}`}>ผู้เห็นขั้นตอน</label>
                    <select
                      id={`fulfillment-step-audience-${index}`}
                      value={step.audience}
                      onChange={(event) => setSteps((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, audience: event.target.value as "CUSTOMER" | "OPERATOR" } : candidate))}
                    >
                      <option value="CUSTOMER">CUSTOMER</option>
                      <option value="OPERATOR">OPERATOR</option>
                    </select>
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
              <button type="button" className="primary-button" onClick={saveProfile} disabled={busy}>บันทึก profile</button>
            </section>

            <section className="admin-fulfillment-card" aria-labelledby="admin-fulfillment-inventory-title">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-eyebrow">INVENTORY</span>
                  <h3 id="admin-fulfillment-inventory-title">เพิ่มหน่วยสินค้าลับ</h3>
                </div>
                <span className="admin-fulfillment-count">พร้อมขาย {profile.availableCount}</span>
              </div>
              {secureType ? (
                <div className="admin-fulfillment-reason-control">
                  <label htmlFor="fulfillment-reveal-reason">เหตุผลเมื่อเปิดเผยข้อมูลลับ</label>
                  <select id="fulfillment-reveal-reason" value={revealReason} onChange={(event) => setRevealReason(event.target.value)}>
                    <option value="CUSTOMER_SUPPORT">บริการลูกค้า</option>
                    <option value="INCIDENT_RESPONSE">ตอบสนองเหตุการณ์</option>
                    <option value="INVENTORY_AUDIT">ตรวจสอบ inventory</option>
                    <option value="FULFILLMENT_RECOVERY">กู้คืน fulfillment</option>
                  </select>
                </div>
              ) : null}
              {!secureType ? (
                <p className="admin-fulfillment-muted">ชนิดนี้ไม่มี encrypted inventory ให้เพิ่ม ใช้ profile และ customer steps แทน</p>
              ) : (
                <div className="admin-fulfillment-secret-form">
                  {type === "DISCORD_ACCOUNT" ? (
                    <>
                      <label htmlFor="fulfillment-email">Email</label>
                      <input id="fulfillment-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
                      <label htmlFor="fulfillment-password">Password</label>
                      <input id="fulfillment-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                    </>
                  ) : (
                    <>
                      <label htmlFor="fulfillment-secret-value">{fieldLabel(type)}</label>
                      <input id="fulfillment-secret-value" type={type === "INVITE_URL" ? "url" : "password"} value={secretValue} onChange={(event) => setSecretValue(event.target.value)} autoComplete="off" />
                    </>
                  )}
                  <label htmlFor="fulfillment-region">Metadata region (ไม่ลับ)</label>
                  <input id="fulfillment-region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="เช่น GLOBAL" />
                  <button type="button" className="primary-button" onClick={addInventoryItem} disabled={busy}>เพิ่ม inventory</button>
                  <label htmlFor="fulfillment-bulk-values">นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)</label>
                  <textarea
                    id="fulfillment-bulk-values"
                    value={bulkValues}
                    onChange={(event) => setBulkValues(event.target.value)}
                    placeholder={type === "DISCORD_ACCOUNT" ? "email<TAB>password" : "ค่าลับหนึ่งค่าต่อหนึ่งบรรทัด"}
                    autoComplete="off"
                  />
                  <p className="admin-fulfillment-muted">Discord account ใช้ TAB คั่น email กับ password; ระบบจะ validate ทุกบรรทัดและไม่เก็บข้อมูลนี้ใน browser storage</p>
                  <button type="button" className="secondary-button" onClick={importInventoryBatch} disabled={busy}>นำเข้าแบบ batch</button>
                </div>
              )}
            </section>
          </div>

          <aside className="admin-fulfillment-sidebar">
            <section className="admin-fulfillment-card" aria-labelledby="admin-fulfillment-list-title">
              <div className="admin-card-heading">
                <div>
                  <span className="admin-eyebrow">AUDITABLE STOCK</span>
                  <h3 id="admin-fulfillment-list-title">รายการ inventory</h3>
                </div>
                <span className="admin-fulfillment-count">ทั้งหมด {inventory.length}</span>
              </div>
              <p className="admin-fulfillment-muted">รายการนี้ไม่ decrypt secret และไม่แสดง ciphertext/nonce</p>
              <div className="admin-fulfillment-inventory-list">
                {inventory.length === 0 ? <p className="admin-fulfillment-empty">ยังไม่มี inventory</p> : null}
                {inventory.map((item) => (
                  <article className="admin-fulfillment-inventory-item" key={item.id}>
                    <div className="admin-fulfillment-item-topline">
                      <strong>#{item.id}</strong>
                      <span className={`admin-status-pill admin-status-${item.status.toLowerCase()}`}>{item.status}</span>
                    </div>
                    <span>{item.fulfillmentType} · {item.provider}</span>
                    <span className="admin-fulfillment-metadata">{Object.entries(item.publicMetadata).map(([key, value]) => `${key}: ${value}`).join(" · ") || "ไม่มี metadata ที่เปิดเผยได้"}</span>
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
                          disabled={busy}
                        >ซ่อนข้อมูล</button>
                      ) : <button type="button" className="secondary-button" onClick={() => revealItem(item)} disabled={busy} aria-label={`เปิดเผยข้อมูลรายการ ${item.id}`}>เปิดเผย</button>}
                      {item.status === "AVAILABLE" ? <button type="button" className="text-button" onClick={() => quarantineItem(item)} disabled={busy}>กักกัน</button> : null}
                      {(item.status === "AVAILABLE" || item.status === "QUARANTINED") ? <button type="button" className="text-button danger" onClick={() => revokeItem(item)} disabled={busy}>ยกเลิก</button> : null}
                    </div>
                    {revealed[item.id] ? <div className="admin-fulfillment-reveal" role="status"><span>เปิดเผยแบบ explicit แล้ว</span>{Object.entries(revealed[item.id].fields).map(([key, value]) => <div key={key}><b>{key}</b><code>{value}</code></div>)}</div> : null}
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      <section className="admin-fulfillment-card admin-manual-ready-card" aria-labelledby="admin-manual-ready-title">
        <div className="admin-card-heading">
          <div>
            <span className="admin-eyebrow">MANUAL DELIVERY</span>
            <h3 id="admin-manual-ready-title">ส่งมอบรายการที่ต้องตรวจด้วยตนเอง</h3>
          </div>
        </div>
        <p className="admin-fulfillment-muted">ใช้ fulfillment ID ของ order ที่ชำระเงินแล้วเท่านั้น ระบบจะตรวจ `PAID` และ `MANUAL` ฝั่ง API อีกครั้ง</p>
        <label htmlFor="admin-manual-fulfillment-id">รหัส fulfillment สำหรับ manual</label>
        <input
          id="admin-manual-fulfillment-id"
          value={fulfillmentIdText}
          onChange={(event) => setFulfillmentIdText(event.target.value)}
          inputMode="numeric"
          placeholder="เช่น 88"
        />
        <div className="admin-fulfillment-item-actions">
          <button type="button" className="primary-button" onClick={markManualFulfillmentReady} disabled={busy}>ยืนยันพร้อมส่งมอบ</button>
          <button type="button" className="secondary-button" onClick={retryFulfillment} disabled={busy}>ลองส่งมอบซ้ำ</button>
        </div>
      </section>
    </section>
  );
}
