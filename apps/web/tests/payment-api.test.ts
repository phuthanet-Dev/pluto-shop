import { describe, expect, it, vi } from "vitest";

import { checkPromptPayPayment, createPromptPayPayment } from "@/lib/payment-api";

const checkoutResponse = {
  orderId: 17,
  transactionId: "Market-test-payment",
  amountMinor: 129900,
  currency: "THB",
  qrUrl: "https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
  payload: "000201010212",
  expiresAt: "2026-08-29T02:00:00Z",
  status: "PENDING",
};

const statusResponse = {
  orderId: 17,
  transactionId: "Market-test-payment",
  amountMinor: 129900,
  currency: "THB",
  expiresAt: "2026-08-29T02:00:00Z",
  status: "PAID",
  message: "Payment completed",
};

describe("PromptPay client", () => {
  it("creates a payment through the same-origin BFF with an idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(checkoutResponse), { status: 200 }),
    );

    await expect(createPromptPayPayment(fetcher, "payment-idempotency-123")).resolves.toEqual(checkoutResponse);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/checkout/promptpay", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": "payment-idempotency-123",
      },
      body: "{}",
    });
  });

  it("checks a transaction through the same-origin BFF and validates status", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(statusResponse), { status: 200 }),
    );

    await expect(checkPromptPayPayment("Market-test-payment", fetcher)).resolves.toEqual(statusResponse);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/payments/promptpay/Market-test-payment/check", {
      method: "POST",
      headers: { accept: "application/json" },
    });
  });
});
