import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAccessToken }));

import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";
import { GET as getMultiGroup, PATCH as patchMultiGroup } from "@/app/api/v1/admin/products/multi/[optionGroup]/route";
import { POST as appendMultiGroup } from "@/app/api/v1/admin/products/multi/[optionGroup]/children/route";

describe("admin products proxy", () => {
  beforeEach(() => {
    process.env.SITE_URL = "http://127.0.0.1:3000";
    process.env.INTERNAL_API_URL = "http://api:8080";
    getAccessToken.mockReset().mockResolvedValue("synthetic-server-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it("forwards the optimistic-lock version when deleting a product", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37?version=0&unexpected=drop-me", {
      method: "DELETE",
      headers: { origin: "http://127.0.0.1:3000" },
    });

    const response = await proxyAdminProductsRequest(request, "/37");

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/products/37?version=0",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("forwards the multi-product endpoint without exposing the browser token", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/multi", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ items: [] }),
    });

    const response = await proxyAdminProductsRequest(request, "/multi");

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/products/multi",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ items: [] }) }),
    );
  });

  it("keeps dynamic group routes same-origin and path-safe", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/multi/legacy_group?q=drop-me", {
      method: "GET",
    });

    const response = await getMultiGroup(request, { params: Promise.resolve({ optionGroup: "legacy_group" }) });

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/products/multi/legacy_group",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects traversal-like group segments before proxying", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/multi/..%2Fsecret", {
      method: "PATCH",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: "{}",
    });

    const response = await patchMultiGroup(request, { params: Promise.resolve({ optionGroup: "../secret" }) });
    const appendResponse = await appendMultiGroup(request, { params: Promise.resolve({ optionGroup: "../secret" }) });

    expect(response.status).toBe(400);
    expect(appendResponse.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves multipart image data and forwards its version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
    const boundary = "----pluto-image-test";
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="cover.jpg"',
      "Content-Type: image/jpeg",
      "",
      "image-bytes",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image?version=0", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        authorization: "Bearer browser-controlled-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const response = await proxyAdminProductsRequest(request, "/37/image");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwardedBody = await new Response(init?.body).text();

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://api:8080/api/v1/admin/products/37/image?version=0",
      expect.objectContaining({ method: "POST" }),
    );
    expect(forwardedBody).toBe(multipartBody);
    expect((init?.headers as Headers).get("content-type")).toContain("multipart/form-data");
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer synthetic-server-token");
  });

  it("keeps binary image previews binary when returning through the proxy", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": String(bytes.length) },
      }),
    ));
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image", {
      method: "GET",
    });

    const response = await proxyAdminProductsRequest(request, "/37/image");

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("rejects an oversized multipart request before buffering or proxying it", async () => {
    const boundary = "----pluto-image-large-test";
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: new Uint8Array(6 * 1024 * 1024 + 1),
    });

    const response = await proxyAdminProductsRequest(request, "/37/image");

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON mutation before buffering or proxying it", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: new Uint8Array(2 * 1024 * 1024 + 1),
    });

    const response = await proxyAdminProductsRequest(request, "");

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a maximum-size multi-product JSON batch within the API contract", async () => {
    const item = {
      slug: "batch-item-" + "x".repeat(100),
      nameTh: "t".repeat(180),
      nameEn: "n".repeat(180),
      shortDescriptionTh: "t".repeat(500),
      shortDescriptionEn: "s".repeat(500),
      descriptionTh: "t".repeat(1000),
      descriptionEn: "d".repeat(1000),
      selectionMode: "SINGLE_OPTION",
      optionGroup: null,
      optionLabelTh: null,
      optionLabelEn: null,
      priceMinor: 0,
      currency: "THB",
      stockQuantity: 0,
      deliveryType: "INSTANT",
      warrantyDays: 0,
      stockWarningThreshold: 0,
      status: "ACTIVE",
      sortOrder: 1,
      version: 0,
    };
    const body = JSON.stringify({
      items: Array.from({ length: 100 }, (_, index) => ({ ...item, slug: `${item.slug}-${index}` })),
    });
    const bodySize = new TextEncoder().encode(body).byteLength;
    expect(bodySize).toBeGreaterThan(256 * 1024);
    expect(bodySize).toBeLessThan(512 * 1024);

    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/multi", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body,
    });

    const response = await proxyAdminProductsRequest(request, "/multi");

    expect(response.status).toBe(204);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(await new Response(init?.body).text()).toBe(body);
  });

  it("rejects a foreign mutation origin before reading credentials or body", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image", {
      method: "POST",
      headers: {
        origin: "https://foreign.example",
        "content-type": "multipart/form-data; boundary=unused",
      },
      body: "not-read",
    });

    const response = await proxyAdminProductsRequest(request, "/37/image");

    expect(response.status).toBe(403);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an authenticated mutation when the server session has no access token", async () => {
    getAccessToken.mockResolvedValue(null);
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "multipart/form-data; boundary=unused",
      },
      body: "not-forwarded",
    });

    const response = await proxyAdminProductsRequest(request, "/37/image");

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
