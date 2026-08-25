"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminProductsApiError,
  archiveAdminProduct,
  createAdminProduct,
  fetchAdminProducts,
  updateAdminProduct,
  type AdminProduct,
  type AdminProductWrite,
} from "@/lib/admin-products";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const visualCodePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function AdminIcon({ kind }: { kind: "plus" | "edit" | "archive" | "search" | "save" | "cancel" }) {
  if (kind === "plus") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4v12M4 10h12" /></svg>;
  }
  if (kind === "edit") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4 14.8-.7 2.7 2.7-.7L16.7 6.1a1.7 1.7 0 0 0-2.4-2.4L4 14.8Z" /><path d="m12.9 4.9 2.2 2.2" /></svg>;
  }
  if (kind === "search") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4" /></svg>;
  }
  if (kind === "save") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 3.5h10l2 2v11H4z" /><path d="M7 3.5v4h6v-4M7 16.5v-4h6v4" /></svg>;
  }
  if (kind === "cancel") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" /></svg>;
  }
  return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 6.5h13v10h-13zM7 6.5V4h6v2.5M3.5 9h13" /><path d="M8 11.5v2.5M12 11.5v2.5" /></svg>;
}

type ProductFormState = {
  slug: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  visualCode: string;
  type: "SINGLE" | "BUNDLE";
  priceMinor: string;
  stockQuantity: string;
  bundleItemCount: string;
  instantDelivery: boolean;
  catalogOrder: string;
  active: boolean;
  version: number;
};

function blankForm(catalogOrder: number): ProductFormState {
  return {
    slug: "",
    nameTh: "",
    nameEn: "",
    descriptionTh: "",
    descriptionEn: "",
    visualCode: "",
    type: "SINGLE",
    priceMinor: "0",
    stockQuantity: "0",
    bundleItemCount: "",
    instantDelivery: true,
    catalogOrder: String(catalogOrder),
    active: true,
    version: 0,
  };
}

function productForm(product: AdminProduct): ProductFormState {
  return {
    slug: product.slug,
    nameTh: product.nameTh,
    nameEn: product.nameEn,
    descriptionTh: product.descriptionTh,
    descriptionEn: product.descriptionEn,
    visualCode: product.visualCode,
    type: product.type,
    priceMinor: String(product.priceMinor),
    stockQuantity: String(product.stockQuantity),
    bundleItemCount: product.bundleItemCount === null ? "" : String(product.bundleItemCount),
    instantDelivery: product.instantDelivery,
    catalogOrder: String(product.catalogOrder),
    active: product.active,
    version: product.version,
  };
}

function formRequest(form: ProductFormState): AdminProductWrite {
  const priceMinor = Number(form.priceMinor);
  const stockQuantity = Number(form.stockQuantity);
  const catalogOrder = Number(form.catalogOrder);
  const bundleItemCount = form.type === "BUNDLE" ? Number(form.bundleItemCount) : null;
  return {
    slug: form.slug.trim(),
    nameTh: form.nameTh.trim(),
    nameEn: form.nameEn.trim(),
    descriptionTh: form.descriptionTh.trim(),
    descriptionEn: form.descriptionEn.trim(),
    visualCode: form.visualCode.trim(),
    type: form.type,
    priceMinor,
    currency: "THB",
    stockQuantity,
    bundleItemCount: bundleItemCount === null || Number.isNaN(bundleItemCount) ? null : bundleItemCount,
    instantDelivery: form.instantDelivery,
    catalogOrder,
    active: form.active,
    version: form.version,
  };
}

function validateForm(form: ProductFormState): string | null {
  if (!slugPattern.test(form.slug.trim())) return "Slug ต้องใช้ตัวอักษรภาษาอังกฤษตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น";
  if (!form.nameTh.trim() || !form.nameEn.trim()) return "กรุณากรอกชื่อสินค้าทั้งภาษาไทยและภาษาอังกฤษ";
  if (!form.descriptionTh.trim() || !form.descriptionEn.trim()) return "กรุณากรอกคำอธิบายสินค้าทั้งภาษาไทยและภาษาอังกฤษ";
  if (!visualCodePattern.test(form.visualCode.trim())) return "รหัสภาพมีอักขระที่ไม่รองรับ";
  if (!Number.isInteger(Number(form.priceMinor)) || Number(form.priceMinor) < 0) return "ราคาต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ";
  if (!Number.isInteger(Number(form.stockQuantity)) || Number(form.stockQuantity) < 0) return "สต็อกต้องเป็นจำนวนเต็มที่ไม่ติดลบ";
  if (!Number.isInteger(Number(form.catalogOrder)) || Number(form.catalogOrder) <= 0) return "ลำดับแคตตาล็อกต้องเป็นจำนวนเต็มบวก";
  if (form.type === "BUNDLE" && (!Number.isInteger(Number(form.bundleItemCount)) || Number(form.bundleItemCount) < 2)) {
    return "ชุดสินค้าต้องมีจำนวนรายการอย่างน้อย 2 รายการ";
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminProductsApiError) {
    if (error.status === 409) return "สินค้านี้ถูกแก้ไขจากที่อื่น กรุณาโหลดตารางใหม่แล้วลองอีกครั้ง";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ";
    if (error.status === 401) return "เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    return error.message;
  }
  return "ไม่สามารถเชื่อมต่อระบบจัดการสินค้าได้ กรุณาลองอีกครั้ง";
}

export function AdminProductsConsole() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const revealFormRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminProducts(submittedQuery);
      setProducts(response.items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [submittedQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchAdminProducts(submittedQuery)
      .then((response) => {
        if (cancelled) return;
        setProducts(response.items);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedQuery]);

  useEffect(() => {
    if (!form || !revealFormRef.current) return;
    revealFormRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [form, editingId]);

  const nextCatalogOrder = useMemo(
    () => products.reduce((highest, product) => Math.max(highest, product.catalogOrder), 0) + 1,
    [products],
  );

  function openCreate() {
    revealFormRef.current = false;
    setEditingId(null);
    setForm(blankForm(nextCatalogOrder));
    setError(null);
    setNotice(null);
  }

  function openEdit(product: AdminProduct) {
    revealFormRef.current = true;
    setEditingId(product.id);
    setForm(productForm(product));
    setError(null);
    setNotice(null);
  }

  function closeForm() {
    if (saving) return;
    revealFormRef.current = false;
    setForm(null);
    setEditingId(null);
  }

  function updateForm<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId === null) {
        await createAdminProduct(formRequest(form));
        setNotice("เพิ่มสินค้าแล้ว");
      } else {
        await updateAdminProduct(editingId, formRequest(form));
        setNotice("แก้ไขสินค้าแล้ว");
      }
      setForm(null);
      setEditingId(null);
      await reload();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(product: AdminProduct) {
    if (!product.active || !window.confirm(`ต้องการเก็บถาวร ${product.nameTh} ใช่หรือไม่ สินค้าจะหายจากแคตตาล็อกสาธารณะ`)) return;
    setError(null);
    setNotice(null);
    try {
      await archiveAdminProduct(product.id, product.version);
      setNotice(`เก็บถาวร ${product.nameTh} แล้ว`);
      await reload();
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    }
  }

  return (
    <section className="admin-products-console" aria-labelledby="admin-products-title">
      <div className="admin-console-header">
        <div>
          <span className="state-code">แอดมิน / แคตตาล็อก</span>
          <h1 id="admin-products-title">แคตตาล็อกสินค้า</h1>
          <p>เพิ่ม แก้ไข จัดการสต็อก และเก็บสินค้าโดยไม่กระทบข้อมูลอ้างอิงเดิม</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <AdminIcon kind="plus" />
          <span>เพิ่มสินค้า</span>
        </button>
      </div>

      <form
        className="admin-product-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setSubmittedQuery(query.trim());
        }}
      >
        <label htmlFor="admin-product-search">ค้นหาสินค้า</label>
        <input
          id="admin-product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          placeholder="รหัส URL ชื่อ คำอธิบาย หรือรหัสภาพ"
        />
        <button className="secondary-button admin-text-icon-button" type="submit"><AdminIcon kind="search" /><span>ค้นหา</span></button>
        {submittedQuery ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setQuery("");
              setLoading(true);
              setSubmittedQuery("");
            }}
          >
            ล้าง
          </button>
        ) : null}
      </form>

      {error ? <p className="admin-feedback error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-feedback success" role="status">{notice}</p> : null}

      {form ? (
        <form ref={formRef} className="admin-product-form" onSubmit={submitForm} aria-labelledby="admin-product-form-title">
          <div className="admin-form-heading">
            <div>
              <span className="state-code">{editingId === null ? "สร้างสินค้า" : "แก้ไขสินค้า"}</span>
              <h2 id="admin-product-form-title">{editingId === null ? "เพิ่มสินค้า" : "แก้ไขสินค้า"}</h2>
            </div>
            <button className="icon-button" type="button" aria-label="ปิดฟอร์มสินค้า" onClick={closeForm}>×</button>
          </div>
          <div className="admin-form-grid">
            <label>รหัส URL<input value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} required /></label>
            <label>รหัสภาพ<input value={form.visualCode} onChange={(event) => updateForm("visualCode", event.target.value)} required /></label>
            <label>ชื่อสินค้า (ภาษาไทย)<input value={form.nameTh} onChange={(event) => updateForm("nameTh", event.target.value)} required /></label>
            <label>ชื่อสินค้า (ภาษาอังกฤษ)<input value={form.nameEn} onChange={(event) => updateForm("nameEn", event.target.value)} required /></label>
            <label className="admin-form-wide">คำอธิบายสินค้า (ภาษาไทย)<textarea value={form.descriptionTh} onChange={(event) => updateForm("descriptionTh", event.target.value)} required /></label>
            <label className="admin-form-wide">คำอธิบายสินค้า (ภาษาอังกฤษ)<textarea value={form.descriptionEn} onChange={(event) => updateForm("descriptionEn", event.target.value)} required /></label>
            <label>ประเภทสินค้า<select value={form.type} onChange={(event) => updateForm("type", event.target.value as ProductFormState["type"])}><option value="SINGLE">สินค้าเดี่ยว (SINGLE)</option><option value="BUNDLE">ชุดสินค้า (BUNDLE)</option></select></label>
            <label>ราคา (สตางค์)<input type="number" min="0" step="1" value={form.priceMinor} onChange={(event) => updateForm("priceMinor", event.target.value)} required /></label>
            <label>จำนวนสต็อก<input type="number" min="0" step="1" value={form.stockQuantity} onChange={(event) => updateForm("stockQuantity", event.target.value)} required /></label>
            <label>จำนวนรายการในชุด<input type="number" min="2" step="1" value={form.bundleItemCount} disabled={form.type === "SINGLE"} onChange={(event) => updateForm("bundleItemCount", event.target.value)} /></label>
            <label>ลำดับแคตตาล็อก<input type="number" min="1" step="1" value={form.catalogOrder} onChange={(event) => updateForm("catalogOrder", event.target.value)} required /></label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.instantDelivery} onChange={(event) => updateForm("instantDelivery", event.target.checked)} /> ส่งมอบทันที</label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} /> แสดงในแคตตาล็อกสาธารณะ</label>
          </div>
          <div className="admin-form-actions">
            <button className="secondary-button admin-text-icon-button" type="button" onClick={closeForm} disabled={saving}><AdminIcon kind="cancel" /><span>ยกเลิก</span></button>
            <button className="primary-button admin-text-icon-button" type="submit" disabled={saving}><AdminIcon kind="save" /><span>{saving ? "กำลังบันทึก…" : "บันทึกสินค้า"}</span></button>
          </div>
        </form>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-product-table">
          <caption className="sr-only">ตารางจัดการสินค้า</caption>
          <thead><tr><th scope="col">สินค้า</th><th scope="col">ประเภท</th><th scope="col">ราคา</th><th scope="col">สต็อก</th><th scope="col">ลำดับ</th><th scope="col">สถานะ</th><th scope="col"><span className="sr-only">การทำงาน</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="admin-table-state">กำลังโหลดสินค้า…</td></tr> : null}
            {!loading && products.length === 0 ? <tr><td colSpan={7} className="admin-table-state">ไม่พบสินค้า</td></tr> : null}
            {!loading ? products.map((product) => (
              <tr key={product.id} className={!product.active ? "is-archived" : undefined}>
                <th scope="row"><strong>{product.nameTh}</strong><span>{product.slug}</span></th>
                <td>{product.type}</td>
                <td>฿{(product.priceMinor / 100).toFixed(2)}</td>
                <td>{product.stockQuantity}{product.bundleItemCount ? ` / ${product.bundleItemCount} รายการ` : ""}</td>
                <td>{product.catalogOrder}</td>
                <td><span className={product.active ? "admin-status active" : "admin-status archived"}>{product.active ? "ใช้งาน" : "เก็บถาวร"}</span></td>
                <td className="admin-row-actions">
                  <button className="text-button admin-icon-button" type="button" aria-label={`แก้ไข ${product.nameTh}`} onClick={() => openEdit(product)}><AdminIcon kind="edit" /></button>
                  <button className="text-button danger admin-icon-button" type="button" disabled={!product.active} aria-label={`เก็บถาวร ${product.nameTh}`} onClick={() => void archiveProduct(product)}><AdminIcon kind="archive" /></button>
                </td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
