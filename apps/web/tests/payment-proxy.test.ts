import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAccessToken }));

import { proxyPaymentRequest } from "@/lib/payment-proxy";

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
});
