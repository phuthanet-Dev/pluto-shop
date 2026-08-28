import { z } from "zod";

const qrUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "api.qrserver.com";
}, "QR URL is not allowed");

const paymentStatus = z.enum(["PENDING", "PAID", "EXPIRED", "FAILED"]);

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

export type PromptPayCheckout = z.infer<typeof checkoutResponseSchema>;
export type PromptPayStatus = z.infer<typeof statusResponseSchema>;

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
