import { describe, expect, it, vi } from "vitest";
import { fetchProducts, productResponseSchema } from "@/lib/products";

const responseBody = {
  items: [
    {
      id: 1,
      slug: "pluto-glyphs",
      nameTh: "ชุดไอคอนพลูโต",
      nameEn: "Pluto Glyph Set",
      descriptionTh: "ไอคอนสำหรับงานสร้างสรรค์",
      descriptionEn: "Icons for creative work",
      visualCode: "PLUTO-01",
      type: "SINGLE",
      selectionMode: "SINGLE_OPTION",
      optionGroup: null,
      optionLabelTh: null,
      optionLabelEn: null,
      priceMinor: 129900,
      currency: "THB",
      stockQuantity: 8,
      bundleItemCount: null,
      instantDelivery: true,
      catalogOrder: 1,
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
});
