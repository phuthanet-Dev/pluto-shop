import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAccessToken } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({ getAccessToken }));

import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";

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
});
