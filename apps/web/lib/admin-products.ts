import { z } from "zod";

const adminProductSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).max(120),
  nameTh: z.string().min(1).max(180),
  nameEn: z.string().min(1).max(180),
  shortDescriptionTh: z.string().max(500).default(""),
  shortDescriptionEn: z.string().max(500).default(""),
  descriptionTh: z.string().min(1).max(1000),
  descriptionEn: z.string().min(1).max(1000),
  selectionMode: z.enum(["SINGLE_OPTION", "MULTI_OPTION"]),
  optionGroup: z.string().min(1).max(120).nullable(),
  optionLabelTh: z.string().min(1).max(180).nullable(),
  optionLabelEn: z.string().min(1).max(180).nullable(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("THB"),
  stockQuantity: z.number().int().nonnegative(),
  deliveryType: z.enum(["INSTANT", "MANUAL"]).default("INSTANT"),
  warrantyDays: z.number().int().nonnegative().default(0),
  stockWarningThreshold: z.number().int().nonnegative().default(5),
  status: z.enum(["ACTIVE", "INACTIVE", "HIDDEN"]).default("ACTIVE"),
  sortOrder: z.number().int().positive().default(1),
  hasImage: z.boolean(),
  imageContentType: z.enum(["image/jpeg", "image/png"]).nullable(),
  imageSizeBytes: z.number().int().positive().nullable(),
  imageWidth: z.number().int().positive().nullable(),
  imageHeight: z.number().int().positive().nullable(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().nullable(),
  version: z.number().int().nonnegative(),
}).strict().superRefine((product, context) => {
  const imageMetadata = [
    product.imageContentType,
    product.imageSizeBytes,
    product.imageWidth,
    product.imageHeight,
  ];
  const allNull = imageMetadata.every((value) => value === null);
  const allPresent = imageMetadata.every((value) => value !== null);
  if ((!allNull && !allPresent) || product.hasImage !== allPresent) {
    context.addIssue({
      code: "custom",
      path: ["hasImage"],
      message: "Image metadata must be either all null or all present",
    });
  }
});

const adminProductListSchema = z.object({
  items: z.array(adminProductSchema).max(1000),
  total: z.number().int().nonnegative(),
}).strict();

const adminProductGroupSchema = z.object({
  optionGroup: z.string().min(1).max(120),
  nameTh: z.string().min(1).max(180),
  nameEn: z.string().min(1).max(180),
  shortDescriptionTh: z.string().max(500),
  shortDescriptionEn: z.string().max(500),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().nullable(),
  version: z.number().int().nonnegative(),
  items: z.array(adminProductSchema),
}).strict();

export type AdminProduct = z.infer<typeof adminProductSchema>;
export type AdminProductList = z.infer<typeof adminProductListSchema>;
export type AdminProductGroup = z.infer<typeof adminProductGroupSchema>;
export type AdminDeliveryType = "INSTANT" | "MANUAL";
export type AdminProductStatus = "ACTIVE" | "INACTIVE" | "HIDDEN";
export type AdminProductWrite = {
  slug: string;
  nameTh: string;
  nameEn: string;
  shortDescriptionTh: string;
  shortDescriptionEn: string;
  descriptionTh: string;
  descriptionEn: string;
  selectionMode: "SINGLE_OPTION" | "MULTI_OPTION";
  optionGroup: string | null;
  optionLabelTh: string | null;
  optionLabelEn: string | null;
  priceMinor: number;
  currency: "THB";
  stockQuantity: number;
  deliveryType: AdminDeliveryType;
  warrantyDays: number;
  stockWarningThreshold: number;
  status: AdminProductStatus;
  sortOrder: number;
  version: number;
};
export type AdminStockWrite = {
  stockQuantity: number;
  version: number;
};
export type AdminProductGroupWrite = {
  nameTh: string;
  nameEn: string;
  shortDescriptionTh: string;
  shortDescriptionEn: string;
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

export async function fetchAdminProduct(
  id: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  return requestJson(
    `/api/v1/admin/products/${id}`,
    { headers: { accept: "application/json" } },
    adminProductSchema,
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

export async function createAdminMultiProduct(
  items: AdminProductWrite[],
  fetcher: typeof fetch = fetch,
  group?: AdminProductGroupWrite,
): Promise<AdminProductList> {
  const body = group ? { group, items } : { items };
  return requestJson(
    "/api/v1/admin/products/multi",
    { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) },
    adminProductListSchema,
    fetcher,
  );
}

export async function fetchAdminMultiProduct(
  optionGroup: string,
  fetcher: typeof fetch = fetch,
): Promise<AdminProductGroup> {
  return requestJson(
    `/api/v1/admin/products/multi/${encodeURIComponent(optionGroup)}`,
    { headers: { accept: "application/json" } },
    adminProductGroupSchema,
    fetcher,
  );
}

export async function updateAdminMultiProductGroup(
  optionGroup: string,
  group: AdminProductGroupWrite,
  fetcher: typeof fetch = fetch,
): Promise<AdminProductGroup> {
  return requestJson(
    `/api/v1/admin/products/multi/${encodeURIComponent(optionGroup)}`,
    { method: "PATCH", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(group) },
    adminProductGroupSchema,
    fetcher,
  );
}

export async function appendAdminMultiProduct(
  optionGroup: string,
  items: AdminProductWrite[],
  group: AdminProductGroupWrite | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AdminProductList> {
  const body = group ? { group, items } : { items };
  return requestJson(
    `/api/v1/admin/products/multi/${encodeURIComponent(optionGroup)}/children`,
    { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) },
    adminProductListSchema,
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

export async function uploadAdminProductImage(
  id: number,
  file: File,
  version: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  const body = new FormData();
  body.append("file", file);
  return requestJson(
    `/api/v1/admin/products/${id}/image?version=${version}`,
    { method: "POST", headers: { accept: "application/json" }, body },
    adminProductSchema,
    fetcher,
  );
}

export async function deleteAdminProductImage(
  id: number,
  version: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminProduct> {
  return requestJson(
    `/api/v1/admin/products/${id}/image?version=${version}`,
    { method: "DELETE", headers: { accept: "application/json" } },
    adminProductSchema,
    fetcher,
  );
}
