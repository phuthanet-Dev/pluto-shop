import { describe, expect, it, vi } from "vitest";

import {
  archiveAdminProduct,
  fetchAdminProducts,
  type AdminProduct,
} from "@/lib/admin-products";

const product: AdminProduct = {
  id: 37,
  slug: "phase3-test-product",
  nameTh: "สินค้า Phase 3",
  nameEn: "Phase 3 Product",
  descriptionTh: "คำอธิบาย",
  descriptionEn: "Description",
  visualCode: "P3-TEST",
  type: "SINGLE",
  priceMinor: 12345,
  currency: "THB",
  stockQuantity: 5,
  bundleItemCount: null,
  instantDelivery: true,
  catalogOrder: 37,
  active: true,
  updatedAt: "2026-08-25T14:00:00Z",
  updatedBy: "admin-subject",
  version: 0,
};

describe("admin products API client", () => {
  it("fetches a strict admin product list", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [product], total: 1 }), { status: 200 }),
    );

    await expect(fetchAdminProducts("phase3", fetcher)).resolves.toEqual({
      items: [product],
      total: 1,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products?q=phase3", {
      headers: { accept: "application/json" },
    });
  });

  it("archives with the server version and reports sanitized errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ type: "about:blank", title: "Product conflict", status: 409 }), {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
    );

    await expect(archiveAdminProduct(product.id, product.version, fetcher)).rejects.toMatchObject({
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/37?version=0", {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
  });
});
