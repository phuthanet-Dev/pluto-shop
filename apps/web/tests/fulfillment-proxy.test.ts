import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAccessToken }));

import { proxyFulfillmentRequest } from "@/lib/fulfillment-proxy";
import { GET as getAdminFulfillment } from "@/app/api/v1/admin/products/[id]/fulfillment/route";
import { POST as importAdminInventory } from "@/app/api/v1/admin/products/[id]/fulfillment/inventory/import/route";
import { POST as markAdminReady } from "@/app/api/v1/admin/fulfillments/[id]/ready/route";
import { POST as retryAdminFulfillment } from "@/app/api/v1/admin/fulfillments/[id]/retry/route";

describe("fulfillment proxy", () => {
  beforeEach(() => {
    process.env.SITE_URL = "http://127.0.0.1:3000";
    process.env.INTERNAL_API_URL = "http://api:8080";
    getAccessToken.mockReset().mockResolvedValue("synthetic-server-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    })));
  });

  it("forwards JSON through the server-side token boundary and preserves no-store", async () => {
    const body = JSON.stringify({
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payloadSchemaVersion: 1,
      version: 0,
      steps: [],
    });
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment", {
      method: "PUT",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
        authorization: "Bearer browser-controlled-token",
      },
      body,
    });

    const response = await proxyFulfillmentRequest(request, "/api/v1/admin/products/37/fulfillment");
    const [, init] = vi.mocked(fetch).mock.calls[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/products/37/fulfillment",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(await new Response(init?.body).text()).toBe(body);
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer synthetic-server-token");
    expect((init?.headers as Headers).get("authorization")).not.toContain("browser-controlled-token");
  });

  it("adds no-store to fulfillment responses even when upstream omits it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const request = new Request("http://127.0.0.1:3000/api/v1/orders/91/fulfillment");

    const response = await proxyFulfillmentRequest(request, "/api/v1/orders/91/fulfillment");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a foreign origin before reading the server session", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment", {
      method: "PUT",
      headers: { origin: "https://foreign.example", "content-type": "application/json" },
      body: "not-forwarded",
    });

    const response = await proxyFulfillmentRequest(request, "/api/v1/admin/products/37/fulfillment");

    expect(response.status).toBe(403);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before proxying it", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment/inventory", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: new Uint8Array(2 * 1024 * 1024 + 1),
    });

    const response = await proxyFulfillmentRequest(request, "/api/v1/admin/products/37/fulfillment/inventory");

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid product ids before proxying the admin route", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/../fulfillment");

    const response = await getAdminFulfillment(request, {
      params: Promise.resolve({ id: "../secret" }),
    });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty inventory import before forwarding", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment/inventory/import", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });

    const response = await importAdminInventory(request, { params: Promise.resolve({ id: "37" }) });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed typed inventory payload before forwarding", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment/inventory", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({
        fulfillmentType: "LICENSE_KEY",
        provider: "SYNTHETIC",
        payload: { password: "must-not-be-accepted-for-license" },
      }),
    });

    const response = await proxyFulfillmentRequest(
      request,
      "/api/v1/admin/products/37/fulfillment/inventory",
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects inventory providers outside the explicit allowlist", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment/inventory", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({
        fulfillmentType: "LICENSE_KEY",
        provider: "UNREVIEWED_PROVIDER",
        payload: { licenseKey: "synthetic-license" },
      }),
    });

    const response = await proxyFulfillmentRequest(
      request,
      "/api/v1/admin/products/37/fulfillment/inventory",
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects public metadata fields outside the non-secret allowlist", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/fulfillment/inventory", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({
        fulfillmentType: "LICENSE_KEY",
        provider: "SYNTHETIC",
        payload: { licenseKey: "synthetic-license" },
        publicMetadata: { account: "must-not-be-public" },
      }),
    });

    const response = await proxyFulfillmentRequest(
      request,
      "/api/v1/admin/products/37/fulfillment/inventory",
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards the operator mark-ready action with a validated fulfillment id", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/fulfillments/88/ready", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: "{}",
    });

    const response = await markAdminReady(request, { params: Promise.resolve({ id: "88" }) });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/fulfillments/88/ready",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards the admin retry action with a validated fulfillment id", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/fulfillments/88/retry", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: "{}",
    });

    const response = await retryAdminFulfillment(request, { params: Promise.resolve({ id: "88" }) });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/fulfillments/88/retry",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
