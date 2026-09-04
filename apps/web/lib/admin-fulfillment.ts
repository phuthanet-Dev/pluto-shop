import { z } from "zod";

const fulfillmentTypeSchema = z.enum([
  "NONE",
  "DISCORD_ACCOUNT",
  "LICENSE_KEY",
  "INVITE_URL",
  "REDEEM_CODE",
  "MANUAL_INSTRUCTION",
]);

const audienceSchema = z.enum(["CUSTOMER", "OPERATOR"]);
const inventoryStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "DELIVERED",
  "REVOKED",
  "QUARANTINED",
]);
const orderFulfillmentStatusSchema = z.enum([
  "PENDING",
  "RESERVED",
  "READY",
  "DELIVERED",
  "FAILED",
  "RELEASED",
  "REVOKED",
]);

const stepSchema = z.object({
  id: z.number().int().positive(),
  stepOrder: z.number().int().positive(),
  audience: audienceSchema,
  titleTh: z.string().min(1).max(180),
  titleEn: z.string().min(1).max(180),
  bodyTh: z.string().min(1).max(4000),
  bodyEn: z.string().min(1).max(4000),
  linkUrl: z.string().url().nullable(),
  enabled: z.boolean(),
}).strict();

const profileSchema = z.object({
  productId: z.number().int().positive(),
  fulfillmentType: fulfillmentTypeSchema,
  provider: z.string().min(1).max(64).nullable(),
  payloadSchemaVersion: z.number().int().positive(),
  quantityPolicy: z.literal("ONE_PER_ORDER_LINE"),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().nullable(),
  availableCount: z.number().int().nonnegative(),
  reservedCount: z.number().int().nonnegative(),
  deliveredCount: z.number().int().nonnegative(),
  steps: z.array(stepSchema).max(50),
}).strict();

const inventoryItemSchema = z.object({
  id: z.number().int().positive(),
  fulfillmentType: z.enum(["DISCORD_ACCOUNT", "LICENSE_KEY", "INVITE_URL", "REDEEM_CODE"]),
  provider: z.string().min(1).max(64),
  payloadSchemaVersion: z.number().int().positive(),
  status: inventoryStatusSchema,
  publicMetadata: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime().nullable(),
  reservedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
}).strict();

const inventoryListSchema = z.object({
  items: z.array(inventoryItemSchema).max(500),
  total: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
}).strict();

const revealSchema = z.object({
  inventoryItemId: z.number().int().positive(),
  fulfillmentType: z.enum(["DISCORD_ACCOUNT", "LICENSE_KEY", "INVITE_URL", "REDEEM_CODE"]),
  provider: z.string().min(1).max(64),
  fields: z.record(z.string(), z.string()),
}).strict();

const adminFulfillmentOrderSchema = z.object({
  fulfillmentId: z.number().int().positive(),
  orderItemId: z.number().int().positive(),
  productId: z.number().int().positive(),
  fulfillmentType: fulfillmentTypeSchema,
  deliveryType: z.enum(["INSTANT", "MANUAL"]),
  status: orderFulfillmentStatusSchema,
}).strict();

const customerLineSchema = z.object({
  orderItemId: z.number().int().positive(),
  productId: z.number().int().positive(),
  fulfillmentType: fulfillmentTypeSchema,
  deliveryType: z.enum(["INSTANT", "MANUAL"]),
  status: orderFulfillmentStatusSchema,
  revealAvailable: z.boolean(),
  customerSteps: z.array(stepSchema),
}).strict();

const customerFulfillmentSchema = z.object({
  orderId: z.number().int().positive(),
  orderStatus: z.string().min(1).max(32),
  lines: z.array(customerLineSchema),
}).strict();

export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;
export type FulfillmentAudience = z.infer<typeof audienceSchema>;
export type FulfillmentStep = z.infer<typeof stepSchema>;
export type AdminFulfillmentProfile = z.infer<typeof profileSchema>;
export type FulfillmentInventoryItem = z.infer<typeof inventoryItemSchema>;
export type FulfillmentInventoryList = z.infer<typeof inventoryListSchema>;
export type FulfillmentReveal = z.infer<typeof revealSchema>;
export type AdminFulfillmentOrder = z.infer<typeof adminFulfillmentOrderSchema>;
export type CustomerFulfillment = z.infer<typeof customerFulfillmentSchema>;

export type FulfillmentStepWrite = Omit<FulfillmentStep, "id">;
export type AdminFulfillmentProfileWrite = {
  fulfillmentType: FulfillmentType;
  provider: string | null;
  payloadSchemaVersion: 1;
  version: number;
  steps?: FulfillmentStepWrite[];
};

export type SecureInventoryWrite =
  | {
      fulfillmentType: "DISCORD_ACCOUNT";
      provider: string;
      payload: { email: string; password: string };
      publicMetadata?: Record<string, string>;
    }
  | {
      fulfillmentType: "LICENSE_KEY";
      provider: string;
      payload: { licenseKey: string };
      publicMetadata?: Record<string, string>;
    }
  | {
      fulfillmentType: "INVITE_URL";
      provider: string;
      payload: { inviteUrl: string };
      publicMetadata?: Record<string, string>;
    }
  | {
      fulfillmentType: "REDEEM_CODE";
      provider: string;
      payload: { code: string };
      publicMetadata?: Record<string, string>;
    };

export class FulfillmentApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "FulfillmentApiError";
  }
}

function positiveId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Fulfillment id is invalid");
  return id;
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(input, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : "Fulfillment request failed";
    throw new FulfillmentApiError(response.status, detail);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Fulfillment response was invalid");
  return parsed.data;
}

export async function fetchAdminFulfillmentProfile(
  productId: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminFulfillmentProfile> {
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment`,
    { headers: { accept: "application/json" } },
    profileSchema,
    fetcher,
  );
}

export async function updateAdminFulfillmentProfile(
  productId: number,
  request: AdminFulfillmentProfileWrite,
  fetcher: typeof fetch = fetch,
): Promise<AdminFulfillmentProfile> {
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment`,
    {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    profileSchema,
    fetcher,
  );
}

export async function fetchAdminInventory(
  productId: number,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentInventoryList> {
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory`,
    { headers: { accept: "application/json" } },
    inventoryListSchema,
    fetcher,
  );
}

export async function addAdminInventory(
  productId: number,
  request: SecureInventoryWrite,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentInventoryItem> {
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    inventoryItemSchema,
    fetcher,
  );
}

export async function importAdminInventory(
  productId: number,
  items: SecureInventoryWrite[],
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentInventoryList> {
  if (items.length === 0 || items.length > 100) throw new Error("Fulfillment import size is invalid");
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory/import`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ items }),
    },
    inventoryListSchema,
    fetcher,
  );
}

export async function revealAdminInventory(
  productId: number,
  inventoryId: number,
  reason: string,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentReveal> {
  if (!/^[A-Z_]{3,32}$/.test(reason)) throw new Error("Fulfillment reveal reason is invalid");
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory/${positiveId(inventoryId)}/reveal`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    revealSchema,
    fetcher,
  );
}

export async function markAdminFulfillmentReady(
  fulfillmentId: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminFulfillmentOrder> {
  return requestJson(
    `/api/v1/admin/fulfillments/${positiveId(fulfillmentId)}/ready`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    },
    adminFulfillmentOrderSchema,
    fetcher,
  );
}

export async function retryAdminFulfillment(
  fulfillmentId: number,
  fetcher: typeof fetch = fetch,
): Promise<AdminFulfillmentOrder> {
  return requestJson(
    `/api/v1/admin/fulfillments/${positiveId(fulfillmentId)}/retry`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    },
    adminFulfillmentOrderSchema,
    fetcher,
  );
}

export async function revokeAdminInventory(
  productId: number,
  inventoryId: number,
  reason: string,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentInventoryItem> {
  if (!/^[A-Z_]{3,32}$/.test(reason)) throw new Error("Fulfillment revoke reason is invalid");
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory/${positiveId(inventoryId)}/revoke`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    inventoryItemSchema,
    fetcher,
  );
}

export async function quarantineAdminInventory(
  productId: number,
  inventoryId: number,
  reason: string,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentInventoryItem> {
  if (!/^[A-Z_]{3,32}$/.test(reason)) throw new Error("Fulfillment quarantine reason is invalid");
  return requestJson(
    `/api/v1/admin/products/${positiveId(productId)}/fulfillment/inventory/${positiveId(inventoryId)}/quarantine`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    },
    inventoryItemSchema,
    fetcher,
  );
}

export async function fetchCustomerFulfillment(
  orderId: number,
  fetcher: typeof fetch = fetch,
): Promise<CustomerFulfillment> {
  return requestJson(
    `/api/v1/orders/${positiveId(orderId)}/fulfillment`,
    { headers: { accept: "application/json" } },
    customerFulfillmentSchema,
    fetcher,
  );
}

export async function revealCustomerFulfillment(
  orderId: number,
  orderItemId: number,
  fetcher: typeof fetch = fetch,
): Promise<FulfillmentReveal> {
  return requestJson(
    `/api/v1/orders/${positiveId(orderId)}/fulfillment/items/${positiveId(orderItemId)}/reveal`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    },
    revealSchema,
    fetcher,
  );
}
