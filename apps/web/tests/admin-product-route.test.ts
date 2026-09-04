import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyAdminProductsRequest } = vi.hoisted(() => ({
  proxyAdminProductsRequest: vi.fn(),
}));

vi.mock("@/lib/admin-products-proxy", () => ({ proxyAdminProductsRequest }));

import { GET } from "@/app/api/v1/admin/products/[id]/route";

describe("admin product item route", () => {
  beforeEach(() => {
    proxyAdminProductsRequest.mockReset();
  });

  it("proxies an authenticated GET for one validated product id", async () => {
    proxyAdminProductsRequest.mockResolvedValue(new Response(JSON.stringify({ id: 37 }), { status: 200 }));
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37", { method: "GET" });

    const response = await GET(request, { params: Promise.resolve({ id: "37" }) });

    expect(response.status).toBe(200);
    expect(proxyAdminProductsRequest).toHaveBeenCalledWith(request, "/37");
  });

  it("rejects an invalid product id before proxying", async () => {
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/v1/admin/products/not-a-number", { method: "GET" }),
      { params: Promise.resolve({ id: "not-a-number" }) },
    );

    expect(response.status).toBe(400);
    expect(proxyAdminProductsRequest).not.toHaveBeenCalled();
  });
});
