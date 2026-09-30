import { describe, expect, it, vi } from "vitest";

import {
  cancelPromptPayPayment,
  checkPromptPayPayment,
  createPromptPayPayment,
  createTrueWalletPayment,
  fetchActivePayment,
  isPromptPayAvailableAt,
} from "@/lib/payment-api";

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
  it("uses Bangkok time for the PromptPay blackout window", () => {
    expect(isPromptPayAvailableAt(new Date("2026-08-29T16:29:59Z"))).toBe(true);
    expect(isPromptPayAvailableAt(new Date("2026-08-29T16:30:00Z"))).toBe(false);
    expect(isPromptPayAvailableAt(new Date("2026-08-29T18:29:59Z"))).toBe(false);
    expect(isPromptPayAvailableAt(new Date("2026-08-29T18:30:00Z"))).toBe(true);
  });

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

  it("cancels a pending transaction through the same-origin BFF", async () => {
    const cancelledResponse = {
      ...statusResponse,
      status: "CANCELLED",
      message: "Payment cancelled",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(cancelledResponse), { status: 200 }),
    );

    await expect(cancelPromptPayPayment("Market-test-payment", fetcher)).resolves.toEqual(cancelledResponse);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/payments/promptpay/Market-test-payment/cancel", {
      method: "POST",
      headers: { accept: "application/json" },
    });
  });
});

describe("TrueWallet client", () => {
  it("redeems through the same-origin BFF with the documented voucher_link field", async () => {
    const responseBody = {
      orderId: 18,
      transactionId: "tw-internal-test",
      amountMinor: 1000,
      currency: "THB",
      providerAmountMinor: 1000,
      status: "PAID",
      message: "Payment completed",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(responseBody), { status: 200 }),
    );
    const voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-voucher";

    await expect(createTrueWalletPayment(voucherLink, fetcher, "truewallet-idempotency-123")).resolves.toEqual(responseBody);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/checkout/truewallet", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": "truewallet-idempotency-123",
      },
      body: JSON.stringify({ voucher_link: voucherLink }),
    });
  });
});

describe("active payment client", () => {
  it("accepts safe active metadata and handles no active payment", async () => {
    const activePayment = {
      paymentMethod: "TRUEWALLET",
      orderId: 18,
      transactionId: "tw-internal-test",
      amountMinor: 1000,
      currency: "THB",
      status: "REVIEW",
      message: "Payment requires manual review",
      qrUrl: null,
      payload: null,
      expiresAt: null,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(activePayment), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(fetchActivePayment(fetcher)).resolves.toEqual(activePayment);
    await expect(fetchActivePayment(fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/v1/payments/active", {
      method: "GET",
      headers: { accept: "application/json" },
    });
  });
});
