import { z } from "zod";

const qrUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "api.qrserver.com";
}, "QR URL is not allowed");

const paymentStatus = z.enum(["PENDING", "PAID", "EXPIRED", "FAILED", "CANCELLED", "REVIEW"]);

const checkoutResponseSchema = z.object({
  orderId: z.number().int().positive(),
  transactionId: z.string().min(1).max(120),
  amountMinor: z.number().int().positive().safe(),
  currency: z.literal("THB"),
  qrUrl,
  payload: z.string().min(1).max(20_000),
  expiresAt: z.string().datetime(),
  status: paymentStatus,
}).strict();

const statusResponseSchema = z.object({
  orderId: z.number().int().positive(),
  transactionId: z.string().min(1).max(120),
  amountMinor: z.number().int().positive().safe(),
  currency: z.literal("THB"),
  expiresAt: z.string().datetime(),
  status: paymentStatus,
  message: z.string().max(200),
}).strict();

const trueWalletVoucherLink = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:"
    && url.hostname === "gift.truemoney.com"
    && url.port === ""
    && url.username === ""
    && url.password === ""
    && url.pathname === "/campaign/"
    && url.hash === ""
    && Boolean(url.searchParams.get("v"));
}, "TrueWallet voucher link is not allowed");

const trueWalletResponseSchema = z.object({
  orderId: z.number().int().positive(),
  transactionId: z.string().min(1).max(120),
  amountMinor: z.number().int().positive().safe(),
  currency: z.literal("THB"),
  providerAmountMinor: z.number().int().positive().safe().nullable(),
  status: paymentStatus,
  message: z.string().max(200),
}).strict();

const activePaymentSchema = z.object({
  paymentMethod: z.enum(["PROMPTPAY", "TRUEWALLET"]),
  orderId: z.number().int().positive(),
  transactionId: z.string().min(1).max(120),
  amountMinor: z.number().int().positive().safe(),
  currency: z.literal("THB"),
  status: z.enum(["PENDING", "REVIEW"]),
  message: z.string().max(200),
  qrUrl: qrUrl.nullable(),
  payload: z.string().min(1).max(20_000).nullable(),
  expiresAt: z.string().datetime().nullable(),
}).strict();

export type PromptPayCheckout = z.infer<typeof checkoutResponseSchema>;
export type PromptPayStatus = z.infer<typeof statusResponseSchema>;
export type TrueWalletPayment = z.infer<typeof trueWalletResponseSchema>;
export type ActivePayment = z.infer<typeof activePaymentSchema>;

export class PaymentApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PaymentApiError";
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
    const detail = typeof body?.detail === "string" ? body.detail : "Payment request failed";
    throw new PaymentApiError(response.status, detail);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Payment response was invalid");
  return parsed.data;
}

export function validTransactionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(value);
}

export function isPromptPayAvailableAt(value: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 90 && minutesSinceMidnight < 1_410;
}

export async function createPromptPayPayment(
  fetcher: typeof fetch = fetch,
  idempotencyKey = globalThis.crypto.randomUUID(),
): Promise<PromptPayCheckout> {
  if (!/^[A-Za-z0-9._:-]{16,100}$/u.test(idempotencyKey)) {
    throw new Error("Payment idempotency key is invalid");
  }
  return requestJson(
    "/api/v1/checkout/promptpay",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: "{}",
    },
    checkoutResponseSchema,
    fetcher,
  );
}

export function validTrueWalletVoucherLink(value: string): boolean {
  return trueWalletVoucherLink.safeParse(value).success;
}

export async function createTrueWalletPayment(
  voucherLink: string,
  fetcher: typeof fetch = fetch,
  idempotencyKey = globalThis.crypto.randomUUID(),
): Promise<TrueWalletPayment> {
  if (!validTrueWalletVoucherLink(voucherLink)) {
    throw new Error("TrueWallet voucher link is invalid");
  }
  if (!/^[A-Za-z0-9._:-]{16,100}$/u.test(idempotencyKey)) {
    throw new Error("Payment idempotency key is invalid");
  }
  return requestJson(
    "/api/v1/checkout/truewallet",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ voucher_link: voucherLink }),
    },
    trueWalletResponseSchema,
    fetcher,
  );
}

export async function checkPromptPayPayment(
  transactionId: string,
  fetcher: typeof fetch = fetch,
): Promise<PromptPayStatus> {
  if (!validTransactionId(transactionId)) throw new Error("Payment transaction is invalid");
  return requestJson(
    `/api/v1/payments/promptpay/${encodeURIComponent(transactionId)}/check`,
    { method: "POST", headers: { accept: "application/json" } },
    statusResponseSchema,
    fetcher,
  );
}

export async function cancelPromptPayPayment(
  transactionId: string,
  fetcher: typeof fetch = fetch,
): Promise<PromptPayStatus> {
  if (!validTransactionId(transactionId)) throw new Error("Payment transaction is invalid");
  return requestJson(
    `/api/v1/payments/promptpay/${encodeURIComponent(transactionId)}/cancel`,
    { method: "POST", headers: { accept: "application/json" } },
    statusResponseSchema,
    fetcher,
  );
}

export async function fetchActivePayment(
  fetcher: typeof fetch = fetch,
): Promise<ActivePayment | null> {
  const response = await fetcher("/api/v1/payments/active", {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : "Payment request failed";
    throw new PaymentApiError(response.status, detail);
  }
  const parsed = activePaymentSchema.safeParse(body);
  if (!parsed.success) throw new Error("Active payment response was invalid");
  return parsed.data;
}
