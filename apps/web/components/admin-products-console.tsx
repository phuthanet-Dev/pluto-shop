"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  if (!slugPattern.test(form.slug.trim())) return "Slug must use lowercase letters, numbers, and hyphens.";
  if (!form.nameTh.trim() || !form.nameEn.trim()) return "Both localized names are required.";
  if (!form.descriptionTh.trim() || !form.descriptionEn.trim()) return "Both localized descriptions are required.";
  if (!visualCodePattern.test(form.visualCode.trim())) return "Visual code contains unsupported characters.";
  if (!Number.isInteger(Number(form.priceMinor)) || Number(form.priceMinor) < 0) return "Price must be a non-negative integer in satang.";
  if (!Number.isInteger(Number(form.stockQuantity)) || Number(form.stockQuantity) < 0) return "Stock must be a non-negative integer.";
  if (!Number.isInteger(Number(form.catalogOrder)) || Number(form.catalogOrder) <= 0) return "Catalog order must be a positive integer.";
  if (form.type === "BUNDLE" && (!Number.isInteger(Number(form.bundleItemCount)) || Number(form.bundleItemCount) < 2)) {
    return "Bundle item count must be at least 2.";
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminProductsApiError) {
    if (error.status === 409) return "This product changed elsewhere. Reload the table and try again.";
    if (error.status === 403) return "Your account does not have admin permission.";
    if (error.status === 401) return "Your admin session has expired. Sign in again.";
    return error.message;
  }
  return "The admin product service is unavailable. Try again.";
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

  const nextCatalogOrder = useMemo(
    () => products.reduce((highest, product) => Math.max(highest, product.catalogOrder), 0) + 1,
    [products],
  );

  function openCreate() {
    setEditingId(null);
    setForm(blankForm(nextCatalogOrder));
    setError(null);
    setNotice(null);
  }

  function openEdit(product: AdminProduct) {
    setEditingId(product.id);
    setForm(productForm(product));
    setError(null);
    setNotice(null);
  }

  function closeForm() {
    if (saving) return;
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
        setNotice("Product created.");
      } else {
        await updateAdminProduct(editingId, formRequest(form));
        setNotice("Product updated.");
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
    if (!product.active || !window.confirm(`Archive ${product.nameEn}? It will disappear from the public catalog.`)) return;
    setError(null);
    setNotice(null);
    try {
      await archiveAdminProduct(product.id, product.version);
      setNotice(`${product.nameEn} archived.`);
      await reload();
    } catch (archiveError) {
      setError(errorMessage(archiveError));
    }
  }

  return (
    <section className="admin-products-console" aria-labelledby="admin-products-title">
      <div className="admin-console-header">
        <div>
          <span className="state-code">ADMIN / CATALOG</span>
          <h1 id="admin-products-title">Product catalog</h1>
          <p>Create, edit, stock-manage, and archive products without changing historical references.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          Add product
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
        <label htmlFor="admin-product-search">Search products</label>
        <input
          id="admin-product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          placeholder="Slug, name, description, visual code"
        />
        <button className="secondary-button" type="submit">Search</button>
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
            Clear
          </button>
        ) : null}
      </form>

      {error ? <p className="admin-feedback error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-feedback success" role="status">{notice}</p> : null}

      {form ? (
        <form className="admin-product-form" onSubmit={submitForm} aria-labelledby="admin-product-form-title">
          <div className="admin-form-heading">
            <div>
              <span className="state-code">{editingId === null ? "CREATE" : "UPDATE"}</span>
              <h2 id="admin-product-form-title">{editingId === null ? "Add product" : "Edit product"}</h2>
            </div>
            <button className="icon-button" type="button" aria-label="Close product form" onClick={closeForm}>×</button>
          </div>
          <div className="admin-form-grid">
            <label>Slug<input value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} required /></label>
            <label>Visual code<input value={form.visualCode} onChange={(event) => updateForm("visualCode", event.target.value)} required /></label>
            <label>Thai name<input value={form.nameTh} onChange={(event) => updateForm("nameTh", event.target.value)} required /></label>
            <label>English name<input value={form.nameEn} onChange={(event) => updateForm("nameEn", event.target.value)} required /></label>
            <label className="admin-form-wide">Thai description<textarea value={form.descriptionTh} onChange={(event) => updateForm("descriptionTh", event.target.value)} required /></label>
            <label className="admin-form-wide">English description<textarea value={form.descriptionEn} onChange={(event) => updateForm("descriptionEn", event.target.value)} required /></label>
            <label>Type<select value={form.type} onChange={(event) => updateForm("type", event.target.value as ProductFormState["type"])}><option value="SINGLE">SINGLE</option><option value="BUNDLE">BUNDLE</option></select></label>
            <label>Price (satang)<input type="number" min="0" step="1" value={form.priceMinor} onChange={(event) => updateForm("priceMinor", event.target.value)} required /></label>
            <label>Stock quantity<input type="number" min="0" step="1" value={form.stockQuantity} onChange={(event) => updateForm("stockQuantity", event.target.value)} required /></label>
            <label>Bundle item count<input type="number" min="2" step="1" value={form.bundleItemCount} disabled={form.type === "SINGLE"} onChange={(event) => updateForm("bundleItemCount", event.target.value)} /></label>
            <label>Catalog order<input type="number" min="1" step="1" value={form.catalogOrder} onChange={(event) => updateForm("catalogOrder", event.target.value)} required /></label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.instantDelivery} onChange={(event) => updateForm("instantDelivery", event.target.checked)} /> Instant delivery</label>
            <label className="admin-checkbox"><input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} /> Visible in public catalog</label>
          </div>
          <div className="admin-form-actions">
            <button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save product"}</button>
          </div>
        </form>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-product-table">
          <caption className="sr-only">Admin product catalog</caption>
          <thead><tr><th scope="col">Product</th><th scope="col">Type</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Order</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="admin-table-state">Loading products…</td></tr> : null}
            {!loading && products.length === 0 ? <tr><td colSpan={7} className="admin-table-state">No products found.</td></tr> : null}
            {!loading ? products.map((product) => (
              <tr key={product.id} className={!product.active ? "is-archived" : undefined}>
                <th scope="row"><strong>{product.nameEn}</strong><span>{product.slug}</span></th>
                <td>{product.type}</td>
                <td>฿{(product.priceMinor / 100).toFixed(2)}</td>
                <td>{product.stockQuantity}{product.bundleItemCount ? ` / ${product.bundleItemCount} items` : ""}</td>
                <td>{product.catalogOrder}</td>
                <td><span className={product.active ? "admin-status active" : "admin-status archived"}>{product.active ? "Active" : "Archived"}</span></td>
                <td className="admin-row-actions">
                  <button className="text-button" type="button" onClick={() => openEdit(product)}>Edit</button>
                  <button className="text-button danger" type="button" disabled={!product.active} aria-label={`Archive ${product.nameEn}`} onClick={() => void archiveProduct(product)}>Archive</button>
                </td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
