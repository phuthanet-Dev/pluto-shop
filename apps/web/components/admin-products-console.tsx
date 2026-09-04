"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { FeedbackDialog } from "@/components/ui/feedback-dialog";
import {
  AdminProductsApiError,
  appendAdminMultiProduct,
  createAdminMultiProduct,
  createAdminProduct,
  deleteAdminProduct,
  deleteAdminProductImage,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchAdminMultiProduct,
  updateAdminMultiProductGroup,
  updateAdminProduct,
  uploadAdminProductImage,
  type AdminProduct,
  type AdminDeliveryType,
  type AdminProductGroup,
  type AdminProductGroupWrite,
  type AdminProductStatus,
  type AdminProductWrite,
} from "@/lib/admin-products";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
function bahtToMinor(value: string): number | null {
  const normalized = value.trim().replace(/,/gu, "");
  if (!/^\d+(?:\.\d{0,2})?$/u.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const wholeMinor = Number(whole) * 100;
  const fractionMinor = Number((fraction + "00").slice(0, 2));
  const result = wholeMinor + fractionMinor;
  return Number.isSafeInteger(result) ? result : null;
}

function AdminIcon({ kind }: { kind: "plus" | "edit" | "trash" | "search" | "save" | "cancel" | "layers" }) {
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
  if (kind === "layers") {
    return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m10 3 7 3.5-7 3.5-7-3.5L10 3Z" /><path d="m3 10 7 3.5 7-3.5M3 13.5l7 3.5 7-3.5" /></svg>;
  }
  return <svg className="admin-action-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 6.5h13v10h-13zM7 6.5V4h6v2.5M3.5 9h13" /><path d="M8 11.5v2.5M12 11.5v2.5" /></svg>;
}

type ProductFormState = {
  slug: string;
  nameTh: string;
  nameEn: string;
  shortDescriptionTh: string;
  shortDescriptionEn: string;
  descriptionTh: string;
  descriptionEn: string;
  selectionMode: "SINGLE_OPTION" | "MULTI_OPTION";
  optionGroup: string;
  optionLabelTh: string;
  optionLabelEn: string;
  priceBaht: string;
  stockQuantity: string;
  deliveryType: AdminDeliveryType;
  warrantyDays: string;
  stockWarningThreshold: string;
  sortOrder: string;
  status: AdminProductStatus;
  version: number;
};

type ProductFormMode = "create" | "product-edit" | "group-edit" | "group-append";

const selectionModeOptions: ReadonlyArray<{
  value: ProductFormState["selectionMode"];
  label: string;
  description: string;
}> = [
  { value: "SINGLE_OPTION", label: "สินค้าตัวเลือกเดียว", description: "กดแล้วเปิดรายละเอียดได้ทันที" },
  { value: "MULTI_OPTION", label: "สินค้าหลายตัวเลือก", description: "รวมรายการย่อยหลายรายการและเลือกก่อนดูรายละเอียด" },
];

function AdminSelectionModeDropdown({
  value,
  onChange,
}: {
  value: ProductFormState["selectionMode"];
  onChange: (value: ProductFormState["selectionMode"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    Math.max(0, selectionModeOptions.findIndex((option) => option.value === value)),
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = "admin-product-selection-mode-listbox";
  const selectedIndex = Math.max(0, selectionModeOptions.findIndex((option) => option.value === value));
  const selectedOption = selectionModeOptions[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function openDropdown() {
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  }

  function chooseOption(index: number) {
    const option = selectionModeOptions[index];
    if (!option) return;
    onChange(option.value);
    setHighlightedIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightedIndex((current) => (current + 1) % selectionModeOptions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightedIndex((current) => (current - 1 + selectionModeOptions.length) % selectionModeOptions.length);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlightedIndex(selectionModeOptions.length - 1);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openDropdown();
      } else {
        chooseOption(highlightedIndex);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`admin-custom-select-field${open ? " is-open" : ""}`}
      onBlur={() => {
        window.requestAnimationFrame(() => {
          if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
        });
      }}
    >
      <span className="admin-field-label">โหมดตัวเลือก</span>
      <button
        ref={triggerRef}
        className="admin-select-trigger"
        type="button"
        role="combobox"
        aria-label="โหมดตัวเลือก"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listboxId}-${highlightedIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={handleKeyDown}
      >
        <span className="admin-select-value">
          <strong>{selectedOption.label}</strong>{" "}
          <span>({selectedOption.value})</span>
        </span>
        <svg className="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open ? (
        <div
          id={listboxId}
          className="admin-select-menu"
          role="listbox"
          aria-label="โหมดตัวเลือก"
        >
          {selectionModeOptions.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              key={option.value}
              className="admin-select-option"
              role="option"
              aria-label={`${option.label} (${option.value})`}
              aria-selected={option.value === value}
              data-highlighted={index === highlightedIndex ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => chooseOption(index)}
            >
              <span className="admin-select-option-title">{option.label} <em>({option.value})</em></span>
              <span className="admin-select-option-description">{option.description}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type AdminMetadataOption<Value extends string> = {
  value: Value;
  label: string;
  description: string;
};

const deliveryTypeOptions: ReadonlyArray<AdminMetadataOption<AdminDeliveryType>> = [
  { value: "INSTANT", label: "ส่งมอบทันที", description: "ลูกค้าได้รับสินค้าได้ทันทีหลังชำระเงิน" },
  { value: "MANUAL", label: "ดำเนินการด้วยตนเอง", description: "ผู้ดูแลดำเนินการส่งมอบหลังตรวจสอบคำสั่งซื้อ" },
];

const productStatusOptions: ReadonlyArray<AdminMetadataOption<AdminProductStatus>> = [
  { value: "ACTIVE", label: "แสดงสินค้า", description: "เปิดให้แสดงและเพิ่มลงรถเข็นจากแคตตาล็อก" },
  { value: "INACTIVE", label: "ปิดการขาย", description: "เก็บสินค้าไว้ใน Admin แต่ไม่เปิดให้ซื้อใหม่" },
  { value: "HIDDEN", label: "ซ่อนจากแคตตาล็อก", description: "ไม่แสดงในหน้าสาธารณะจนกว่าจะเปิดใช้งาน" },
];

function AdminProductMetadataDropdown<Value extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: Value;
  options: ReadonlyArray<AdminMetadataOption<Value>>;
  onChange: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = `${id}-listbox`;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function openDropdown() {
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setHighlightedIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightedIndex((current) => (current + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openDropdown();
        return;
      }
      setHighlightedIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openDropdown();
      } else {
        chooseOption(highlightedIndex);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`admin-custom-select-field${open ? " is-open" : ""}`}
      onBlur={() => {
        window.requestAnimationFrame(() => {
          if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
        });
      }}
    >
      <span className="admin-field-label">{label}</span>
      <button
        ref={triggerRef}
        className="admin-select-trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listboxId}-${highlightedIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={handleKeyDown}
      >
        <span className="admin-select-value">
          <strong>{selectedOption.label}</strong>{" "}
          <span>({selectedOption.value})</span>
        </span>
        <svg className="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open ? (
        <div id={listboxId} className="admin-select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <div
              id={`${listboxId}-${index}`}
              key={option.value}
              className="admin-select-option"
              role="option"
              aria-label={`${option.label} (${option.value})`}
              aria-selected={option.value === value}
              data-highlighted={index === highlightedIndex ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => chooseOption(index)}
            >
              <span className="admin-select-option-title">{option.label} <em>({option.value})</em></span>
              <span className="admin-select-option-description">{option.description}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MAX_MULTI_CHILDREN = 100;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

function blankForm(sortOrder: number): ProductFormState {
  return {
    slug: "",
    nameTh: "",
    nameEn: "",
    shortDescriptionTh: "",
    shortDescriptionEn: "",
    descriptionTh: "",
    descriptionEn: "",
    selectionMode: "SINGLE_OPTION",
    optionGroup: "",
    optionLabelTh: "",
    optionLabelEn: "",
    priceBaht: "0.00",
    stockQuantity: "0",
    deliveryType: "INSTANT",
    warrantyDays: "0",
    stockWarningThreshold: "5",
    sortOrder: String(sortOrder),
    status: "ACTIVE",
    version: 0,
  };
}

function blankMultiChild(sortOrder: number): ProductFormState {
  return {
    ...blankForm(sortOrder),
    selectionMode: "MULTI_OPTION",
  };
}

function productForm(product: AdminProduct): ProductFormState {
  return {
    slug: product.slug,
    nameTh: product.nameTh,
    nameEn: product.nameEn,
    shortDescriptionTh: product.shortDescriptionTh,
    shortDescriptionEn: product.shortDescriptionEn,
    descriptionTh: product.descriptionTh,
    descriptionEn: product.descriptionEn,
    selectionMode: product.selectionMode,
    optionGroup: product.optionGroup ?? "",
    optionLabelTh: product.optionLabelTh ?? "",
    optionLabelEn: product.optionLabelEn ?? "",
    priceBaht: (product.priceMinor / 100).toFixed(2),
    stockQuantity: String(product.stockQuantity),
    deliveryType: product.deliveryType,
    warrantyDays: String(product.warrantyDays),
    stockWarningThreshold: String(product.stockWarningThreshold),
    sortOrder: String(product.sortOrder),
    status: product.status,
    version: product.version,
  };
}

function groupForm(group: AdminProductGroup, sortOrder: number): ProductFormState {
  return {
    ...blankMultiChild(sortOrder),
    nameTh: group.nameTh,
    nameEn: group.nameEn,
    shortDescriptionTh: group.shortDescriptionTh,
    shortDescriptionEn: group.shortDescriptionEn,
    optionGroup: group.optionGroup,
  };
}

function groupWrite(form: ProductFormState, version: number): AdminProductGroupWrite {
  return {
    nameTh: form.nameTh.trim(),
    nameEn: form.nameEn.trim(),
    shortDescriptionTh: form.shortDescriptionTh.trim(),
    shortDescriptionEn: form.shortDescriptionEn.trim(),
    version,
  };
}

function formRequest(form: ProductFormState): AdminProductWrite {
  const priceMinor = bahtToMinor(form.priceBaht) ?? 0;
  const stockQuantity = Number(form.stockQuantity);
  const sortOrder = Number(form.sortOrder);
  const optionGroup = form.selectionMode === "MULTI_OPTION" ? form.optionGroup.trim() : null;
  const optionLabelTh = form.selectionMode === "MULTI_OPTION" ? form.optionLabelTh.trim() : null;
  const optionLabelEn = form.selectionMode === "MULTI_OPTION" ? form.optionLabelEn.trim() : null;
  return {
    slug: form.slug.trim(),
    nameTh: form.nameTh.trim(),
    nameEn: form.nameEn.trim(),
    shortDescriptionTh: form.shortDescriptionTh.trim(),
    shortDescriptionEn: form.shortDescriptionEn.trim(),
    descriptionTh: form.descriptionTh.trim(),
    descriptionEn: form.descriptionEn.trim(),
    selectionMode: form.selectionMode,
    optionGroup,
    optionLabelTh,
    optionLabelEn,
    priceMinor,
    currency: "THB",
    stockQuantity,
    deliveryType: form.deliveryType,
    warrantyDays: Number(form.warrantyDays),
    stockWarningThreshold: Number(form.stockWarningThreshold),
    status: form.status,
    sortOrder,
    version: form.version,
  };
}

function validateForm(form: ProductFormState): string | null {
  if (!slugPattern.test(form.slug.trim())) return "Slug ต้องใช้ตัวอักษรภาษาอังกฤษตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น";
  if (!form.nameTh.trim() || !form.nameEn.trim()) return "กรุณากรอกชื่อสินค้าทั้งภาษาไทยและภาษาอังกฤษ";
  if (!form.shortDescriptionTh.trim() || !form.shortDescriptionEn.trim()) return "กรุณากรอกคำโปรยสั้นทั้งภาษาไทยและภาษาอังกฤษ";
  if (!form.descriptionTh.trim() || !form.descriptionEn.trim()) return "กรุณากรอกคำอธิบายสินค้าทั้งภาษาไทยและภาษาอังกฤษ";
  if (form.selectionMode === "MULTI_OPTION") {
    if (!slugPattern.test(form.optionGroup.trim())) return "กลุ่มตัวเลือกต้องใช้ตัวอักษรภาษาอังกฤษตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น";
    if (!form.optionLabelTh.trim() || !form.optionLabelEn.trim()) return "กรุณากรอกชื่อ option ทั้งภาษาไทยและภาษาอังกฤษ";
  }
  if (bahtToMinor(form.priceBaht) === null) return "ราคาต้องเป็นจำนวนบาทที่มีทศนิยมไม่เกิน 2 ตำแหน่ง";
  if (!Number.isInteger(Number(form.stockQuantity)) || Number(form.stockQuantity) < 0) return "สต็อกต้องเป็นจำนวนเต็มที่ไม่ติดลบ";
  if (!Number.isInteger(Number(form.warrantyDays)) || Number(form.warrantyDays) < 0) return "วันรับประกันต้องเป็นจำนวนเต็มที่ไม่ติดลบ";
  if (!Number.isInteger(Number(form.stockWarningThreshold)) || Number(form.stockWarningThreshold) < 0) return "เกณฑ์แจ้งเตือนสต็อกต้องเป็นจำนวนเต็มที่ไม่ติดลบ";
  if (!Number.isInteger(Number(form.sortOrder)) || Number(form.sortOrder) <= 0) return "ลำดับแสดงผลต้องเป็นจำนวนเต็มบวก";
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

async function fetchAdminProductsWithCatalogMax(query: string) {
  const visiblePromise = fetchAdminProducts(query);
  const catalogPromise = query.trim() ? fetchAdminProducts("") : visiblePromise;
  const [visible, catalog] = await Promise.all([visiblePromise, catalogPromise]);
  return {
    visible,
    highestSortOrder: catalog.items.reduce(
      (highest, product) => Math.max(highest, product.sortOrder),
      0,
    ),
  };
}

export function AdminProductsConsole() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [multiChildren, setMultiChildren] = useState<ProductFormState[]>([]);
  const [formMode, setFormMode] = useState<ProductFormMode>("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupVersion, setGroupVersion] = useState(0);
  const [catalogHighestSortOrder, setCatalogHighestSortOrder] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageProduct, setImageProduct] = useState<AdminProduct | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageSaving, setImageSaving] = useState(false);
  const [deleteImageOpen, setDeleteImageOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const revealFormRef = useRef(false);
  const listRequestEpochRef = useRef(0);
  const mutationBusy = saving || imageSaving || deleting;

  const reload = useCallback(async (): Promise<AdminProduct[] | null> => {
    const requestEpoch = ++listRequestEpochRef.current;
    setLoading(true);
    setError(null);
    try {
      const { visible, highestSortOrder } = await fetchAdminProductsWithCatalogMax(submittedQuery);
      if (requestEpoch !== listRequestEpochRef.current) return null;
      setProducts(visible.items);
      setCatalogHighestSortOrder(highestSortOrder);
      setSessionExpired(false);
      return visible.items;
    } catch (loadError) {
      if (requestEpoch !== listRequestEpochRef.current) return null;
      setSessionExpired(loadError instanceof AdminProductsApiError && loadError.status === 401);
      setError(errorMessage(loadError));
      return null;
    } finally {
      if (requestEpoch === listRequestEpochRef.current) setLoading(false);
    }
  }, [submittedQuery]);

  useEffect(() => {
    const requestEpoch = ++listRequestEpochRef.current;
    let cancelled = false;
    fetchAdminProductsWithCatalogMax(submittedQuery)
      .then(({ visible, highestSortOrder }) => {
        if (cancelled || requestEpoch !== listRequestEpochRef.current) return;
        setProducts(visible.items);
        setCatalogHighestSortOrder(highestSortOrder);
        setError(null);
        setSessionExpired(false);
      })
      .catch((loadError: unknown) => {
        if (!cancelled && requestEpoch === listRequestEpochRef.current) {
          setSessionExpired(loadError instanceof AdminProductsApiError && loadError.status === 401);
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled && requestEpoch === listRequestEpochRef.current) setLoading(false);
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

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const nextCatalogOrder = catalogHighestSortOrder + 1;

  function invalidateProductListRequests() {
    listRequestEpochRef.current += 1;
    setLoading(false);
  }

  function openCreate() {
    if (mutationBusy) return;
    revealFormRef.current = false;
    setFormMode("create");
    setEditingId(null);
    setEditingGroup(null);
    setGroupVersion(0);
    setForm(blankForm(nextCatalogOrder));
    setMultiChildren([]);
    setImageProduct(null);
    clearImageSelection();
    setDeleteImageOpen(false);
    setError(null);
    setNotice(null);
  }

  function openEdit(product: AdminProduct) {
    if (mutationBusy) return;
    revealFormRef.current = true;
    setFormMode("product-edit");
    setEditingId(product.id);
    setEditingGroup(null);
    setGroupVersion(0);
    setForm(productForm(product));
    setMultiChildren([]);
    setImageProduct(product);
    clearImageSelection();
    setDeleteImageOpen(false);
    setError(null);
    setNotice(null);
  }

  async function openGroupForm(product: AdminProduct, mode: "group-edit" | "group-append") {
    if (!product.optionGroup || mutationBusy) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const group = await fetchAdminMultiProduct(product.optionGroup);
      const highestSortOrder = group.items.reduce(
        (highest, item) => Math.max(highest, item.sortOrder),
        nextCatalogOrder,
      );
      revealFormRef.current = true;
      setFormMode(mode);
      setEditingId(null);
      setEditingGroup(group.optionGroup);
      setGroupVersion(group.version);
      setForm(groupForm(group, highestSortOrder + 1));
      setMultiChildren([]);
      setImageProduct(null);
      clearImageSelection();
      setDeleteImageOpen(false);
    } catch (loadError) {
      setSessionExpired(loadError instanceof AdminProductsApiError && loadError.status === 401);
      setError(errorMessage(loadError));
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    if (mutationBusy) return;
    revealFormRef.current = false;
    setForm(null);
    setMultiChildren([]);
    setFormMode("create");
    setEditingId(null);
    setEditingGroup(null);
    setGroupVersion(0);
    setImageProduct(null);
    clearImageSelection();
    setDeleteImageOpen(false);
  }

  function updateForm<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function changeSelectionMode(value: ProductFormState["selectionMode"]) {
    updateForm("selectionMode", value);
    if (value === "SINGLE_OPTION" || formMode !== "create") {
      setMultiChildren([]);
      return;
    }
    setMultiChildren((current) => current.length > 0
      ? current.map((child) => ({ ...child, selectionMode: value }))
      : [blankMultiChild(nextCatalogOrder + 1)]);
  }

  function updateMultiChild<K extends keyof ProductFormState>(
    index: number,
    key: K,
    value: ProductFormState[K],
  ) {
    setMultiChildren((current) => current.map((child, childIndex) =>
      childIndex === index ? { ...child, [key]: value } : child));
  }

  function addMultiChild() {
    if (form && multiChildren.length + 1 >= MAX_MULTI_CHILDREN) {
      setError(`สินค้าหลายตัวเลือกมีรายการย่อยได้ไม่เกิน ${MAX_MULTI_CHILDREN} รายการ`);
      return;
    }
    const draftOrders = [form, ...multiChildren]
      .filter((child): child is ProductFormState => child !== null)
      .map((child) => Number(child.sortOrder))
      .filter(Number.isInteger);
    const highestDraftOrder = draftOrders.length > 0 ? Math.max(...draftOrders) : nextCatalogOrder;
    setMultiChildren((current) => [
      ...current,
      {
        ...blankMultiChild(Math.max(nextCatalogOrder, highestDraftOrder + 1)),
        optionGroup: form?.optionGroup ?? "",
      },
    ]);
  }

  function removeMultiChild(index: number) {
    const minimumExtraChildren = formMode === "group-append" ? 0 : 1;
    setMultiChildren((current) => current.length <= minimumExtraChildren
      ? current
      : current.filter((_, childIndex) => childIndex !== index));
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || mutationBusy) return;

    if (formMode === "group-edit") {
      const cardValidationError = [
        [form.nameTh, "ชื่อบน product card (ภาษาไทย)"],
        [form.nameEn, "ชื่อบน product card (ภาษาอังกฤษ)"],
        [form.shortDescriptionTh, "คำโปรยบน product card (ภาษาไทย)"],
        [form.shortDescriptionEn, "คำโปรยบน product card (ภาษาอังกฤษ)"],
      ].find(([value]) => !value.trim())?.[1];
      if (cardValidationError) {
        setError(`กรุณากรอก${cardValidationError}`);
        return;
      }
      if (!editingGroup) return;
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        await updateAdminMultiProductGroup(editingGroup, groupWrite(form, groupVersion));
        setNotice("แก้ไขข้อมูลบน product card ของกลุ่มแล้ว");
        setForm(null);
        setMultiChildren([]);
        setFormMode("create");
        setEditingId(null);
        setEditingGroup(null);
        setGroupVersion(0);
        await reload();
      } catch (saveError) {
        setSessionExpired(saveError instanceof AdminProductsApiError && saveError.status === 401);
        setError(errorMessage(saveError));
      } finally {
        setSaving(false);
      }
      return;
    }

    const childForms = form.selectionMode === "MULTI_OPTION"
      ? [form, ...multiChildren]
      : [form];
    const normalizedChildForms = childForms.map((child) => form.selectionMode === "MULTI_OPTION"
      ? {
          ...child,
          nameTh: form.nameTh,
          nameEn: form.nameEn,
          shortDescriptionTh: form.shortDescriptionTh,
          shortDescriptionEn: form.shortDescriptionEn,
          selectionMode: "MULTI_OPTION" as const,
          optionGroup: form.optionGroup,
        }
      : child);
    const validationError = normalizedChildForms
      .map((child) => validateForm(child))
      .find((message): message is string => message !== null)
      ?? (formMode === "create" && form.selectionMode === "MULTI_OPTION" && normalizedChildForms.length < 2
        ? "สินค้าหลายตัวเลือกต้องมีรายการย่อยอย่างน้อย 2 รายการ"
        : null);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (formMode === "group-append") {
        if (!editingGroup) return;
        await appendAdminMultiProduct(
          editingGroup,
          normalizedChildForms.map((child) => formRequest(child)),
          groupWrite(form, groupVersion),
        );
        setNotice(`เพิ่มรายการย่อยในกลุ่มแล้ว ${normalizedChildForms.length} รายการ`);
      } else if (editingId === null) {
        if (form.selectionMode === "MULTI_OPTION") {
          await createAdminMultiProduct(
            normalizedChildForms.map((child) => formRequest(child)),
            fetch,
            groupWrite(form, 0),
          );
          setNotice(`เพิ่มสินค้า ${normalizedChildForms.length} รายการย่อยแล้ว`);
        } else {
          await createAdminProduct(formRequest(form));
          setNotice("เพิ่มสินค้าแล้ว");
        }
      } else {
        await updateAdminProduct(editingId, formRequest(form));
        setNotice("แก้ไขสินค้าแล้ว");
      }
      setForm(null);
      setMultiChildren([]);
      setFormMode("create");
      setEditingId(null);
      setEditingGroup(null);
      setGroupVersion(0);
      setImageProduct(null);
      clearImageSelection();
      setDeleteImageOpen(false);
      await reload();
    } catch (saveError) {
      setSessionExpired(saveError instanceof AdminProductsApiError && saveError.status === 401);
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteProduct(product: AdminProduct) {
    if (mutationBusy) return;
    setError(null);
    setNotice(null);
    setDeleteCandidate(product);
  }

  async function confirmDeleteProduct() {
    if (!deleteCandidate || mutationBusy) return;
    const product = deleteCandidate;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminProduct(product.id, product.version);
      setNotice(`ลบ ${product.nameTh} และนำออกจากรถเข็นทั้งหมดแล้ว`);
      setDeleteCandidate(null);
      if (editingId === product.id) {
        revealFormRef.current = false;
        setForm(null);
        setMultiChildren([]);
        setFormMode("create");
        setEditingId(null);
        setEditingGroup(null);
        setGroupVersion(0);
        setImageProduct(null);
        clearImageSelection();
        setDeleteImageOpen(false);
      }
      await reload();
    } catch (deleteError) {
      setSessionExpired(deleteError instanceof AdminProductsApiError && deleteError.status === 401);
      setError(errorMessage(deleteError));
      setDeleteCandidate(null);
    } finally {
      setDeleting(false);
    }
  }

  function applyImageProductUpdate(updatedProduct: AdminProduct) {
    invalidateProductListRequests();
    setProducts((current) => current.map((product) => product.id === updatedProduct.id ? updatedProduct : product));
    setImageProduct(updatedProduct);
    setForm((current) => current ? { ...current, version: updatedProduct.version } : current);
  }

  function clearImageSelection() {
    setImageFile(null);
    setImagePreviewUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function reconcileImageProduct(productId: number, failureMessage: string) {
    const requestEpoch = ++listRequestEpochRef.current;
    try {
      const refreshedProduct = await fetchAdminProduct(productId);
      if (requestEpoch !== listRequestEpochRef.current) return;
      setProducts((current) => current.map((product) => product.id === productId ? refreshedProduct : product));
      setImageProduct(refreshedProduct);
      setForm((current) => current ? { ...current, version: refreshedProduct.version } : current);
      setError(failureMessage);
    } catch (refreshError) {
      if (requestEpoch !== listRequestEpochRef.current) return;
      setSessionExpired(refreshError instanceof AdminProductsApiError && refreshError.status === 401);
      setError(errorMessage(refreshError));
      setImageProduct(null);
      clearImageSelection();
      setDeleteImageOpen(false);
      if (refreshError instanceof AdminProductsApiError && refreshError.status === 404 && editingId === productId) {
        revealFormRef.current = false;
        setForm(null);
        setFormMode("create");
        setEditingId(null);
        setMultiChildren([]);
        setEditingGroup(null);
        setGroupVersion(0);
      }
    }
  }

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    if (!PRODUCT_IMAGE_TYPES.has(file.type)) {
      setError("รองรับเฉพาะ JPEG และ PNG");
      event.currentTarget.value = "";
      clearImageSelection();
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      setError("รูปสินค้าต้องมีขนาดไม่เกิน 5 MiB");
      event.currentTarget.value = "";
      clearImageSelection();
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreviewUrl(
      typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
    );
  }

  async function uploadImage() {
    if (!imageProduct || !imageFile || mutationBusy) return;
    const productId = imageProduct.id;
    invalidateProductListRequests();
    setImageSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updatedProduct = await uploadAdminProductImage(imageProduct.id, imageFile, imageProduct.version);
      applyImageProductUpdate(updatedProduct);
      clearImageSelection();
      setNotice("อัปโหลดรูปสินค้าแล้ว");
    } catch (uploadError) {
      setSessionExpired(uploadError instanceof AdminProductsApiError && uploadError.status === 401);
      await reconcileImageProduct(productId, errorMessage(uploadError));
    } finally {
      setImageSaving(false);
    }
  }

  async function confirmDeleteImage() {
    if (!imageProduct || mutationBusy) return;
    const productId = imageProduct.id;
    invalidateProductListRequests();
    setImageSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updatedProduct = await deleteAdminProductImage(imageProduct.id, imageProduct.version);
      applyImageProductUpdate(updatedProduct);
      clearImageSelection();
      setDeleteImageOpen(false);
      setNotice("ลบรูปสินค้าแล้ว");
    } catch (deleteError) {
      setSessionExpired(deleteError instanceof AdminProductsApiError && deleteError.status === 401);
      await reconcileImageProduct(productId, errorMessage(deleteError));
      setDeleteImageOpen(false);
    } finally {
      setImageSaving(false);
    }
  }

  function renderGroupCardFields(readOnly: boolean) {
    if (!form) return null;
    return (
      <fieldset className="admin-multi-child-card admin-group-card-fields">
        <legend>ข้อมูลบน Product Card</legend>
        <div className="admin-sidebar-heading">
          <div>
            <span className="admin-sidebar-kicker">ข้อมูลรวมของกลุ่ม</span>
            <h3>ข้อมูลบน Product Card</h3>
          </div>
          <span className="admin-shared-badge">SHARED</span>
        </div>
        <p className="admin-form-help">
          ข้อมูลนี้จะถูกใช้ร่วมกับทุกตัวเลือกในกลุ่ม
          {readOnly ? " หากต้องการแก้ไข ให้ใช้ปุ่มแก้ไขข้อมูลกลุ่ม" : ""}
        </p>
        <div className="admin-group-card-section">
          <span className="admin-group-card-section-title">ชื่อบน Product Card</span>
          <label className="admin-localized-field">
            <span className="admin-language-badge">TH</span>
            <span className="admin-language-name">ภาษาไทย</span>
            <input aria-label="ชื่อบน product card (ภาษาไทย)" value={form.nameTh} onChange={(event) => updateForm("nameTh", event.target.value)} maxLength={180} disabled={readOnly} required />
          </label>
          <label className="admin-localized-field">
            <span className="admin-language-badge">EN</span>
            <span className="admin-language-name">ภาษาอังกฤษ</span>
            <input aria-label="ชื่อบน product card (ภาษาอังกฤษ)" value={form.nameEn} onChange={(event) => updateForm("nameEn", event.target.value)} maxLength={180} disabled={readOnly} required />
          </label>
        </div>
        <div className="admin-group-card-section">
          <span className="admin-group-card-section-title">คำโปรยบน Product Card</span>
          <label className="admin-localized-field admin-localized-field-textarea">
            <span className="admin-language-badge">TH</span>
            <span className="admin-language-name">ภาษาไทย</span>
            <textarea aria-label="คำโปรยบน product card (ภาษาไทย)" value={form.shortDescriptionTh} onChange={(event) => updateForm("shortDescriptionTh", event.target.value)} maxLength={500} disabled={readOnly} required />
            <span className="admin-character-count">{form.shortDescriptionTh.length} / 500</span>
          </label>
          <label className="admin-localized-field admin-localized-field-textarea">
            <span className="admin-language-badge">EN</span>
            <span className="admin-language-name">ภาษาอังกฤษ</span>
            <textarea aria-label="คำโปรยบน product card (ภาษาอังกฤษ)" value={form.shortDescriptionEn} onChange={(event) => updateForm("shortDescriptionEn", event.target.value)} maxLength={500} disabled={readOnly} required />
            <span className="admin-character-count">{form.shortDescriptionEn.length} / 500</span>
          </label>
        </div>
      </fieldset>
    );
  }

  function renderProductFields(
    child: ProductFormState,
    labelPrefix: string,
    update: <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => void,
    childIndex: number,
    includeSharedFields = true,
  ) {
    const fieldLabel = (label: string) => labelPrefix ? `${labelPrefix} · ${label}` : label;
    return (
      <>
        <label>{fieldLabel("รหัส URL")}<input aria-label={fieldLabel("รหัส URL")} value={child.slug} onChange={(event) => update("slug", event.target.value)} required /></label>
        {includeSharedFields ? (
          <>
            <label>{fieldLabel("ชื่อสินค้า (ภาษาไทย)")}<input aria-label={fieldLabel("ชื่อสินค้า (ภาษาไทย)")} value={child.nameTh} onChange={(event) => update("nameTh", event.target.value)} required /></label>
            <label>{fieldLabel("ชื่อสินค้า (ภาษาอังกฤษ)")}<input aria-label={fieldLabel("ชื่อสินค้า (ภาษาอังกฤษ)")} value={child.nameEn} onChange={(event) => update("nameEn", event.target.value)} required /></label>
            <label className="admin-form-wide">{fieldLabel("คำโปรยสั้น (ภาษาไทย)")}<textarea aria-label={fieldLabel("คำโปรยสั้น (ภาษาไทย)")} maxLength={500} value={child.shortDescriptionTh} onChange={(event) => update("shortDescriptionTh", event.target.value)} required /></label>
            <label className="admin-form-wide">{fieldLabel("คำโปรยสั้น (ภาษาอังกฤษ)")}<textarea aria-label={fieldLabel("คำโปรยสั้น (ภาษาอังกฤษ)")} maxLength={500} value={child.shortDescriptionEn} onChange={(event) => update("shortDescriptionEn", event.target.value)} required /></label>
          </>
        ) : null}
        <label className="admin-form-wide">{fieldLabel("คำอธิบายสินค้า (ภาษาไทย)")}<textarea aria-label={fieldLabel("คำอธิบายสินค้า (ภาษาไทย)")} value={child.descriptionTh} onChange={(event) => update("descriptionTh", event.target.value)} required /></label>
        <label className="admin-form-wide">{fieldLabel("คำอธิบายสินค้า (ภาษาอังกฤษ)")}<textarea aria-label={fieldLabel("คำอธิบายสินค้า (ภาษาอังกฤษ)")} value={child.descriptionEn} onChange={(event) => update("descriptionEn", event.target.value)} required /></label>
        {child.selectionMode === "MULTI_OPTION" ? (
          <>
            <label>{fieldLabel("ชื่อ option (ภาษาไทย)")}<input aria-label={fieldLabel("ชื่อ option (ภาษาไทย)")} value={child.optionLabelTh} onChange={(event) => update("optionLabelTh", event.target.value)} required /></label>
            <label>{fieldLabel("ชื่อ option (ภาษาอังกฤษ)")}<input aria-label={fieldLabel("ชื่อ option (ภาษาอังกฤษ)")} value={child.optionLabelEn} onChange={(event) => update("optionLabelEn", event.target.value)} required /></label>
          </>
        ) : null}
        <label>{fieldLabel("ราคา (บาท)")}<input aria-label={fieldLabel("ราคา (บาท)")} type="text" inputMode="decimal" value={child.priceBaht} onChange={(event) => update("priceBaht", event.target.value)} required /></label>
        <label>{fieldLabel("จำนวนสต็อก")}<input aria-label={fieldLabel("จำนวนสต็อก")} type="number" min="0" step="1" value={child.stockQuantity} onChange={(event) => update("stockQuantity", event.target.value)} required /></label>
        <AdminProductMetadataDropdown id={`delivery-type-${childIndex}`} label={fieldLabel("รูปแบบการส่งมอบ")} value={child.deliveryType} options={deliveryTypeOptions} onChange={(value) => update("deliveryType", value)} />
        <label>{fieldLabel("วันรับประกัน")}<input aria-label={fieldLabel("วันรับประกัน")} type="number" min="0" step="1" value={child.warrantyDays} onChange={(event) => update("warrantyDays", event.target.value)} required /></label>
        <label>{fieldLabel("เกณฑ์เตือนสต็อก")}<input aria-label={fieldLabel("เกณฑ์เตือนสต็อก")} type="number" min="0" step="1" value={child.stockWarningThreshold} onChange={(event) => update("stockWarningThreshold", event.target.value)} required /></label>
        <label>{fieldLabel("ลำดับแสดงผล")}<input aria-label={fieldLabel("ลำดับแสดงผล")} type="number" min="1" step="1" value={child.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} required /></label>
        <AdminProductMetadataDropdown id={`product-status-${childIndex}`} label={fieldLabel("สถานะสินค้า")} value={child.status} options={productStatusOptions} onChange={(value) => update("status", value)} />
      </>
    );
  }

  const currentEditingProduct = editingId === null
    ? null
    : products.find((product) => product.id === editingId) ?? null;

  return (
    <section className="admin-products-console" aria-labelledby="admin-products-title">
      <div className="admin-console-header">
        <div>
          <span className="state-code">แอดมิน / แคตตาล็อก</span>
          <h1 id="admin-products-title">แคตตาล็อกสินค้า</h1>
          <p>เพิ่ม แก้ไข จัดการสต็อก และลบสินค้าออกจากฐานข้อมูลพร้อมรถเข็นของผู้ใช้ทุกคน</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate} disabled={mutationBusy}>
          <AdminIcon kind="plus" />
          <span>เพิ่มสินค้า</span>
        </button>
      </div>

      <form
        className="admin-product-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (mutationBusy) return;
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
          placeholder="รหัส URL ชื่อ หรือคำอธิบาย"
        />
        <button className="secondary-button admin-text-icon-button" type="submit" disabled={mutationBusy}><AdminIcon kind="search" /><span>ค้นหา</span></button>
        {submittedQuery ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              if (mutationBusy) return;
              setQuery("");
              setLoading(true);
              setSubmittedQuery("");
            }}
            disabled={mutationBusy}
          >
            ล้าง
          </button>
        ) : null}
      </form>

      {error ? (
        <p className="admin-feedback error" role="alert">
          {error}
          {sessionExpired ? (
            <Link href="/api/auth/login?callbackUrl=%2Fadmin" prefetch={false}>เข้าสู่ระบบใหม่</Link>
          ) : null}
        </p>
      ) : null}
      {notice ? <p className="admin-feedback success" role="status">{notice}</p> : null}

      <FeedbackDialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteCandidate(null);
        }}
        tone="danger"
        title="ยืนยันการลบสินค้า"
        description={deleteCandidate
          ? `ต้องการลบ ${deleteCandidate.nameTh} ออกจากฐานข้อมูลถาวรหรือไม่ สินค้าจะถูกนำออกจากรถเข็นของผู้ใช้ทุกคนและไม่สามารถกู้คืนได้`
          : ""}
        closeLabel="ปิดหน้าต่างยืนยัน"
        cancelLabel="ยกเลิก"
        confirmLabel="ลบสินค้า"
        busy={deleting}
        busyLabel="กำลังลบ…"
        onConfirm={confirmDeleteProduct}
      />

      <FeedbackDialog
        open={deleteImageOpen}
        onOpenChange={(open) => {
          if (!open && !mutationBusy) setDeleteImageOpen(false);
        }}
        tone="danger"
        title="ยืนยันการลบรูปสินค้า"
        description="รูปปัจจุบันจะถูกลบออกจาก storage หลังบันทึกการเปลี่ยนแปลง และไม่สามารถกู้คืนได้"
        closeLabel="ปิดหน้าต่างยืนยันการลบรูป"
        cancelLabel="ยกเลิก"
        confirmLabel="ลบรูปสินค้า"
        busy={imageSaving}
        busyLabel="กำลังลบ…"
        onConfirm={confirmDeleteImage}
      />

      {form ? (
        <form ref={formRef} className="admin-product-form" onSubmit={submitForm} aria-labelledby="admin-product-form-title">
          <div className="admin-form-heading">
            <div className="admin-form-heading-copy">
              <div className="admin-form-heading-kicker">
                <span className="state-code">
                  {formMode === "create" ? "สร้างสินค้า" : formMode === "product-edit" ? "แก้ไขรายการย่อย" : formMode === "group-append" ? "เพิ่มรายการย่อยในกลุ่ม" : "แก้ไขข้อมูลกลุ่ม"}
                </span>
                {form.selectionMode === "MULTI_OPTION" ? <span className="admin-mode-badge">MULTI OPTION</span> : null}
              </div>
              <h2 id="admin-product-form-title">
                {formMode === "create" ? "เพิ่มสินค้า" : formMode === "product-edit" ? "แก้ไขรายการย่อย" : formMode === "group-append" ? "เพิ่มรายการย่อยในกลุ่ม" : "แก้ไขข้อมูลกลุ่ม"}
              </h2>
              <p className="admin-form-subtitle">กำหนดรูปแบบและข้อมูลที่จะแสดงบน Product Card</p>
            </div>
            <button className="icon-button" type="button" aria-label="ปิดฟอร์มสินค้า" onClick={closeForm} disabled={mutationBusy}>×</button>
          </div>
          {formMode === "product-edit" && imageProduct ? (
            <fieldset className="admin-product-image-panel">
              <legend>รูปสินค้า</legend>
              <p className="admin-form-help">รองรับ JPEG หรือ PNG ขนาดไม่เกิน 5 MiB ระบบจะตรวจชนิดไฟล์และเนื้อหาจริงอีกครั้งที่ API</p>
              {imagePreviewUrl || imageProduct.hasImage ? (
                <div className="admin-product-image-preview">
                  <Image
                    src={imagePreviewUrl ?? `/api/v1/admin/products/${imageProduct.id}/image`}
                    alt={`ตัวอย่างรูปสินค้า ${imageProduct.nameTh}`}
                    width={320}
                    height={200}
                    unoptimized
                  />
                </div>
              ) : <p className="admin-form-help">ยังไม่มีรูปสินค้า</p>}
              <label htmlFor="admin-product-image-file">เลือกรูปสินค้า</label>
              <input
                id="admin-product-image-file"
                aria-label="รูปสินค้า"
                type="file"
                accept="image/jpeg,image/png"
                ref={imageInputRef}
                onChange={selectImage}
                disabled={mutationBusy}
              />
              {imageFile ? <p className="admin-form-help">ไฟล์ที่เลือก: {imageFile.name}</p> : null}
              <div className="admin-form-actions admin-image-actions">
                <button className="secondary-button" type="button" onClick={() => void uploadImage()} disabled={!imageFile || mutationBusy}>
                  {imageSaving ? "กำลังอัปโหลด…" : "อัปโหลดรูปสินค้า"}
                </button>
                {imageProduct.hasImage ? (
                  <button className="text-button danger" type="button" onClick={() => setDeleteImageOpen(true)} disabled={mutationBusy}>
                    ลบรูปสินค้า
                  </button>
                ) : null}
              </div>
            </fieldset>
          ) : formMode === "create" ? (
            <p className="admin-form-help admin-form-wide">บันทึกสินค้าแล้วจึงอัปโหลดรูปสินค้าได้</p>
          ) : null}
          <fieldset className="admin-form-fields" disabled={mutationBusy}>
            <div className={`admin-form-layout${form.selectionMode === "MULTI_OPTION" ? " is-multi" : " is-single"}`}>
              <div className="admin-form-main">
                <section className="admin-panel admin-configuration-card" aria-labelledby="admin-configuration-title">
                  <div className="admin-panel-heading">
                    <span className="admin-section-icon"><AdminIcon kind="layers" /></span>
                    <div className="admin-panel-heading-copy">
                      <h3 id="admin-configuration-title">การตั้งค่ากลุ่มตัวเลือก</h3>
                      <p>กำหนดรูปแบบและข้อมูลที่จะแสดงบน Product Card</p>
                    </div>
                  </div>
                  <div className="admin-config-grid">
                    {formMode === "create" || formMode === "product-edit" ? (
                      <div className="admin-config-field">
                        <AdminSelectionModeDropdown value={form.selectionMode} onChange={changeSelectionMode} />
                        <p className="admin-field-helper">กำหนดรูปแบบการเลือกสินค้าของกลุ่ม</p>
                      </div>
                    ) : (
                      <div className="admin-config-field admin-config-readonly">
                        <span className="admin-field-label">โหมดตัวเลือก</span>
                        <div className="admin-config-mode-value">
                          <strong>สินค้าหลายตัวเลือก</strong>
                          <span>(MULTI_OPTION)</span>
                        </div>
                        <span className="admin-field-helper">คงโหมดเดิมเพื่อรักษาลิงก์ของกลุ่ม</span>
                      </div>
                    )}
                    {form.selectionMode === "MULTI_OPTION" ? (
                      <label className="admin-config-field">
                        <span className="admin-field-label">กลุ่มตัวเลือก <span className="admin-required" aria-hidden="true">*</span></span>
                        <input aria-label="กลุ่มตัวเลือก" value={form.optionGroup} onChange={(event) => updateForm("optionGroup", event.target.value)} placeholder="เช่น claude-full-access" readOnly={formMode === "group-edit" || formMode === "group-append"} required />
                        <span className="admin-field-helper">ชื่อสำหรับใช้จัดกลุ่มตัวเลือกสินค้า</span>
                      </label>
                    ) : null}
                  </div>
                </section>

                {form.selectionMode === "MULTI_OPTION" ? (
                  <section className="admin-panel admin-options-panel" aria-labelledby="admin-options-title">
                    <div className="admin-panel-heading admin-options-heading">
                      <span className="admin-section-icon"><AdminIcon kind="layers" /></span>
                      <div className="admin-panel-heading-copy">
                        <div className="admin-panel-heading-row">
                          <h3 id="admin-options-title">รายการตัวเลือก</h3>
                          <span className="admin-count-badge">{formMode === "group-edit" ? "จัดการจากตาราง" : `${multiChildren.length + 1} รายการ`}</span>
                        </div>
                        <p>เพิ่มและกำหนดรายละเอียดของตัวเลือกแต่ละรายการในกลุ่ม</p>
                      </div>
                    </div>
                    {formMode === "group-edit" ? (
                      <div className="admin-options-empty-state">
                        <span className="admin-empty-icon"><AdminIcon kind="layers" /></span>
                        <strong>จัดการรายการย่อยจากตารางสินค้า</strong>
                        <p>แก้ไขรายการย่อยนี้ทีละรายการจากตารางด้านล่าง เพื่อรักษา version และสต็อกของแต่ละรายการ</p>
                      </div>
                    ) : (
                      <div className="admin-multi-children" role="group" aria-label="รายการสินค้าย่อย">
                        <fieldset className="admin-multi-child-card">
                          <legend>{formMode === "group-append" ? "รายการย่อยใหม่ที่ 1" : "รายการย่อยที่ 1"}</legend>
                          <div className="admin-form-grid">{renderProductFields(form, "", updateForm, 0, false)}</div>
                        </fieldset>
                        {multiChildren.map((child, index) => (
                          <fieldset className="admin-multi-child-card" key={`multi-child-${index}`}>
                            <legend>รายการย่อยใหม่ที่ {index + 2}</legend>
                            {multiChildren.length > (formMode === "group-append" ? 0 : 1) ? (
                              <button className="text-button danger admin-remove-child" type="button" onClick={() => removeMultiChild(index)} disabled={mutationBusy}>
                                ลบรายการย่อยใหม่ที่ {index + 2}
                              </button>
                            ) : null}
                            <div className="admin-form-grid">{renderProductFields(child, `รายการย่อยใหม่ที่ ${index + 2}`, (key, value) => updateMultiChild(index, key, value), index + 1, false)}</div>
                          </fieldset>
                        ))}
                        {formMode === "create" || formMode === "group-append" ? (
                          <button className="secondary-button admin-add-child admin-text-icon-button" type="button" onClick={addMultiChild} disabled={mutationBusy || multiChildren.length + 1 >= MAX_MULTI_CHILDREN}>
                            <AdminIcon kind="plus" />
                            <span>เพิ่มรายการย่อย</span>
                          </button>
                        ) : (
                          <p className="admin-form-help">แก้ไขรายการย่อยนี้ทีละรายการจากตารางด้านล่าง เพื่อรักษา version และสต็อกของแต่ละรายการ</p>
                        )}
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="admin-panel admin-product-details-panel" aria-labelledby="admin-product-details-title">
                    <div className="admin-panel-heading">
                      <div className="admin-panel-heading-copy">
                        <h3 id="admin-product-details-title">รายละเอียดสินค้า</h3>
                        <p>ข้อมูลเฉพาะของสินค้าที่ใช้แสดงและจัดการในแคตตาล็อก</p>
                      </div>
                    </div>
                    <div className="admin-form-grid">{renderProductFields(form, "", updateForm, 0)}</div>
                  </section>
                )}
              </div>
              {form.selectionMode === "MULTI_OPTION" ? (
                <aside className="admin-form-sidebar">
                  {renderGroupCardFields(formMode === "product-edit")}
                </aside>
              ) : null}
            </div>
          </fieldset>
          {formMode === "product-edit" && currentEditingProduct?.optionGroup ? (
            <div className="admin-form-group-actions" role="group" aria-label="การทำงานของกลุ่มตัวเลือก">
              <button className="secondary-button admin-text-icon-button" type="button" onClick={() => void openGroupForm(currentEditingProduct, "group-edit")} disabled={mutationBusy}>
                <AdminIcon kind="edit" />
                <span>แก้ไขข้อมูลกลุ่มนี้</span>
              </button>
              <button className="primary-button admin-text-icon-button" type="button" onClick={() => void openGroupForm(currentEditingProduct, "group-append")} disabled={mutationBusy}>
                <AdminIcon kind="plus" />
                <span>เพิ่มรายการย่อยในกลุ่มนี้</span>
              </button>
            </div>
          ) : null}
          <div className="admin-form-actions">
            <button className="secondary-button admin-text-icon-button" type="button" onClick={closeForm} disabled={mutationBusy}><AdminIcon kind="cancel" /><span>ยกเลิก</span></button>
            <button className="primary-button admin-text-icon-button" type="submit" disabled={mutationBusy}><AdminIcon kind="save" /><span>{saving ? "กำลังบันทึก…" : formMode === "group-edit" ? "บันทึกข้อมูลกลุ่ม" : formMode === "group-append" ? "บันทึกและเพิ่มรายการย่อย" : "บันทึกสินค้า"}</span></button>
          </div>
        </form>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-product-table">
          <caption className="sr-only">ตารางจัดการสินค้า</caption>
          <thead><tr><th scope="col">สินค้า</th><th scope="col">ราคา</th><th scope="col">สต็อก</th><th scope="col">ส่งมอบ</th><th scope="col">ลำดับ</th><th scope="col">สถานะ</th><th scope="col"><span className="sr-only">การทำงาน</span></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="admin-table-state">กำลังโหลดสินค้า…</td></tr> : null}
            {!loading && products.length === 0 ? <tr><td colSpan={7} className="admin-table-state">ไม่พบสินค้า</td></tr> : null}
            {!loading ? products.map((product) => (
              <tr key={product.id} className={product.status !== "ACTIVE" ? "is-archived" : undefined}>
                <th scope="row">
                  <strong>{product.nameTh}</strong>
                  <span>{product.slug}</span>
                  {product.selectionMode === "MULTI_OPTION" && product.optionLabelTh ? (
                    <span className="admin-product-option">รายการย่อย: {product.optionLabelTh} · {product.optionGroup}</span>
                  ) : null}
                </th>
                <td>฿{(product.priceMinor / 100).toFixed(2)}</td>
                <td>{product.stockQuantity}{product.stockQuantity > 0 && product.stockQuantity <= product.stockWarningThreshold ? <span className="admin-stock-warning">ใกล้หมด</span> : null}</td>
                <td>{product.deliveryType === "INSTANT" ? "ทันที" : "ด้วยตนเอง"}</td>
                <td>{product.sortOrder}</td>
                <td><span className={`admin-status ${product.status.toLowerCase()}`}>{product.status === "ACTIVE" ? "ใช้งาน" : product.status === "HIDDEN" ? "ซ่อน" : "ปิดการขาย"}</span></td>
                <td className="admin-row-actions">
                  {product.selectionMode === "MULTI_OPTION" && product.optionGroup ? (
                    <>
                      <button className="text-button admin-icon-button" type="button" aria-label={`เพิ่มรายการย่อยในกลุ่ม ${product.optionGroup}`} onClick={() => void openGroupForm(product, "group-append")} disabled={mutationBusy}><AdminIcon kind="plus" /></button>
                      <button className="text-button admin-icon-button" type="button" aria-label={`แก้ไขข้อมูลกลุ่ม ${product.optionGroup}`} onClick={() => void openGroupForm(product, "group-edit")} disabled={mutationBusy}><AdminIcon kind="edit" /></button>
                    </>
                  ) : null}
                  <button className="text-button admin-icon-button" type="button" aria-label={`แก้ไข ${product.nameTh}`} onClick={() => openEdit(product)} disabled={mutationBusy}><AdminIcon kind="edit" /></button>
                  <button className="text-button danger admin-icon-button" type="button" aria-label={`ลบ ${product.nameTh}`} onClick={() => requestDeleteProduct(product)} disabled={mutationBusy}><AdminIcon kind="trash" /></button>
                </td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
