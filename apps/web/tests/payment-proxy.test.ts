import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAccessToken }));

import { proxyPaymentReadRequest, proxyPaymentRequest } from "@/lib/payment-proxy";

describe("payment proxy", () => {
  beforeEach(() => {
    process.env.SITE_URL = "http://127.0.0.1:3000";
    process.env.INTERNAL_API_URL = "http://api:8080";
    getAccessToken.mockResolvedValue("server-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response('{"status":"ok"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
  });

  it("forwards the idempotency key to the internal API without exposing provider credentials", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/checkout/promptpay", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
        "idempotency-key": "payment-proxy-key-1234",
      },
      body: "{}",
    });

    const response = await proxyPaymentRequest(request, "/api/v1/checkout/promptpay");
    expect(response.status).toBe(200);

    const fetcher = vi.mocked(fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer server-token");
    expect(headers.get("idempotency-key")).toBe("payment-proxy-key-1234");
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("forwards TrueWallet voucher payloads only to the internal API", async () => {
    const voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-voucher";
    const request = new Request("http://127.0.0.1:3000/api/v1/checkout/truewallet", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
        "idempotency-key": "truewallet-proxy-key",
      },
      body: JSON.stringify({ voucher_link: voucherLink }),
    });

    const response = await proxyPaymentRequest(request, "/api/v1/checkout/truewallet");
    expect(response.status).toBe(200);

    const fetcher = vi.mocked(fetch);
    const [target, init] = fetcher.mock.calls[0] ?? [];
    expect(target).toBe("http://api:8080/api/v1/checkout/truewallet");
    expect(init?.body).toBe(JSON.stringify({ voucher_link: voucherLink }));
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer server-token");
    expect(headers.get("idempotency-key")).toBe("truewallet-proxy-key");
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("forwards active-payment reads only to the internal API", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/payments/active", { method: "GET" });
    const response = await proxyPaymentReadRequest(request, "/api/v1/payments/active");

    expect(response.status).toBe(200);
    const fetcher = vi.mocked(fetch);
    const [target, init] = fetcher.mock.calls[0] ?? [];
    expect(target).toBe("http://api:8080/api/v1/payments/active");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer server-token");
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("preserves no active payment as a bodyless 204 instead of locking cart recovery", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const request = new Request("http://127.0.0.1:3000/api/v1/payments/active");
    const response = await proxyPaymentReadRequest(request, "/api/v1/payments/active");

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects an oversized payment body before contacting the internal API", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/checkout/truewallet", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: `{"voucher_link":"${"x".repeat(20_000)}"}`,
    });

    const response = await proxyPaymentRequest(request, "/api/v1/checkout/truewallet");

    expect(response.status).toBe(413);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
