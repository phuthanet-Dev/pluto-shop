import { describe, expect, it, vi } from "vitest";
import { fetchProducts, productResponseSchema } from "@/lib/products";

const responseBody = {
  items: [
    {
      id: 1,
      slug: "pluto-glyphs",
      nameTh: "ชุดไอคอนพลูโต",
      nameEn: "Pluto Glyph Set",
      shortDescriptionTh: "คำโปรยสั้น",
      shortDescriptionEn: "Short summary",
      descriptionTh: "ไอคอนสำหรับงานสร้างสรรค์",
      descriptionEn: "Icons for creative work",
      selectionMode: "SINGLE_OPTION",
      optionGroup: null,
      optionLabelTh: null,
      optionLabelEn: null,
      priceMinor: 129900,
      currency: "THB",
      stockQuantity: 8,
      deliveryType: "INSTANT",
      warrantyDays: 30,
      instantDelivery: true,
      catalogOrder: 1,
      imageUrl: "/api/v1/product-images/550e8400-e29b-41d4-a716-446655440000",
    },
  ],
  total: 1,
  priceRange: { minMinor: 129900, maxMinor: 129900, currency: "THB" },
} as const;

describe("product API contract", () => {
  it("fetches only the same-origin API path and validates the payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await fetchProducts(
      { q: "glyphs", maxPriceMinor: 150000, inStock: true },
      new AbortController().signal,
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/products?q=glyphs&maxPriceMinor=150000&inStock=true",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual(responseBody);
  });

  it("rejects untrusted payloads instead of rendering fallback data", async () => {
    const invalid = {
      ...responseBody,
      items: [{ ...responseBody.items[0], currency: "USD" }],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 }));

    await expect(
      fetchProducts(
        { q: "", maxPriceMinor: undefined, inStock: false },
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow("Product API response was invalid");
    expect(productResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects absolute product image URLs", () => {
    const invalid = {
      ...responseBody,
      items: [{
        ...responseBody.items[0],
        imageUrl: "https://evil.invalid/product.jpg",
      }],
    };

    expect(productResponseSchema.safeParse(invalid).success).toBe(false);
    expect(productResponseSchema.safeParse({
      ...responseBody,
      items: [{ ...responseBody.items[0], imageUrl: "/api/v1/product-images/not-a-uuid" }],
    }).success).toBe(false);
  });
});
