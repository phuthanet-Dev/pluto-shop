import { z } from "zod";

const adminProductSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).max(120),
  nameTh: z.string().min(1).max(180),
  nameEn: z.string().min(1).max(180),
  descriptionTh: z.string().min(1).max(1000),
  descriptionEn: z.string().min(1).max(1000),
  visualCode: z.string().min(1).max(80),
  type: z.enum(["SINGLE", "BUNDLE"]),
  selectionMode: z.enum(["SINGLE_OPTION", "MULTI_OPTION"]),
  optionGroup: z.string().min(1).max(120).nullable(),
  optionLabelTh: z.string().min(1).max(180).nullable(),
  optionLabelEn: z.string().min(1).max(180).nullable(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("THB"),
  stockQuantity: z.number().int().nonnegative(),
  bundleItemCount: z.number().int().min(2).nullable(),
  instantDelivery: z.boolean(),
  catalogOrder: z.number().int().positive(),
  active: z.boolean(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().nullable(),
  version: z.number().int().nonnegative(),
}).strict();

const adminProductListSchema = z.object({
  items: z.array(adminProductSchema).max(1000),
  total: z.number().int().nonnegative(),
}).strict();

export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminProductList = z.infer<typeof adminProductListSchema>;
export type AdminProductWrite = {
  slug: string;
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  visualCode: string;
  type: "SINGLE" | "BUNDLE";
  selectionMode: "SINGLE_OPTION" | "MULTI_OPTION";
  optionGroup: string | null;
  optionLabelTh: string | null;
  optionLabelEn: string | null;
  priceMinor: number;
  currency: "THB";
  stockQuantity: number;
  bundleItemCount: number | null;
  instantDelivery: boolean;
  catalogOrder: number;
  active: boolean;
  version: number;
};
export type AdminStockWrite = {
  stockQuantity: number;
  bundleItemCount: number | null;
  version: number;
};

export class AdminProductsApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AdminProductsApiError";
  }
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(input, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : "Admin product request failed";
    throw new AdminProductsApiError(response.status, detail);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Admin product response was invalid");
  return parsed.data;
}

async function requestNoContent(
  input: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : "Admin product request failed";
    throw new AdminProductsApiError(response.status, detail);
  }
}

export async function fetchAdminProducts(
  query = "",
  fetcher: typeof fetch = fetch,
): Promise<AdminProductList> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson(
    `/api/v1/admin/products${suffix}`,
    { headers: { accept: "application/json" } },
    adminProductListSchema,
    fetcher,
  );
}

export async function createAdminProduct(
  request: AdminProductWrite,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  return requestJson(
    "/api/v1/admin/products",
    { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(request) },
    adminProductSchema,
    fetcher,
  );
}

export async function updateAdminProduct(
  id: number,
  request: AdminProductWrite,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  return requestJson(
    `/api/v1/admin/products/${id}`,
    { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(request) },
    adminProductSchema,
    fetcher,
  );
}

export async function updateAdminStock(
  id: number,
  request: AdminStockWrite,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  return requestJson(
    `/api/v1/admin/products/${id}/stock`,
    { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(request) },
    adminProductSchema,
    fetcher,
  );
}

export async function deleteAdminProduct(
  id: number,
  version: number,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  return requestNoContent(
    `/api/v1/admin/products/${id}?version=${version}`,
    { method: "DELETE", headers: { accept: "application/json" } },
    fetcher,
  );
}
