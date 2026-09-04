import { describe, expect, it, vi } from "vitest";

const { proxyAdminProductsRequest } = vi.hoisted(() => ({
  proxyAdminProductsRequest: vi.fn(),
}));

vi.mock("@/lib/admin-products-proxy", () => ({ proxyAdminProductsRequest }));

import { DELETE, GET, POST } from "@/app/api/v1/admin/products/[id]/image/route";

describe("admin product image route", () => {
  it("rejects invalid product ids before proxying", async () => {
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/v1/admin/products/nope/image", { method: "POST" }),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect(proxyAdminProductsRequest).not.toHaveBeenCalled();
  });

  it("proxies all image operations with the validated product suffix", async () => {
    proxyAdminProductsRequest.mockResolvedValue(new Response(null, { status: 204 }));
    const request = new Request("http://127.0.0.1:3000/api/v1/admin/products/37/image", { method: "GET" });
    const context = { params: Promise.resolve({ id: "37" }) };

    await GET(request, context);
    await POST(new Request(request, { method: "POST" }), context);
    await DELETE(new Request(request, { method: "DELETE" }), context);

    expect(proxyAdminProductsRequest).toHaveBeenNthCalledWith(1, request, "/37/image");
    expect(proxyAdminProductsRequest).toHaveBeenNthCalledWith(2, expect.any(Request), "/37/image");
    expect(proxyAdminProductsRequest).toHaveBeenNthCalledWith(3, expect.any(Request), "/37/image");
  });
});
