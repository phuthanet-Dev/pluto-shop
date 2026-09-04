import { describe, expect, it } from "vitest";

import { productResponseSchema } from "@/lib/products";

describe("product metadata contract", () => {
  it("accepts product presentation and delivery metadata", () => {
    const payload = {
      items: [{
        id: 1,
        slug: "pluto-glyphs",
        nameTh: "ชุดไอคอนพลูโต",
        nameEn: "Pluto Glyph Set",
        descriptionTh: "คำอธิบายแบบเต็ม",
        descriptionEn: "Full product description",
        shortDescriptionTh: "คำโปรยสั้น",
        shortDescriptionEn: "Short product summary",
        selectionMode: "SINGLE_OPTION",
        optionGroup: null,
        optionLabelTh: null,
        optionLabelEn: null,
        priceMinor: 129900,
        currency: "THB",
        stockQuantity: 8,
        deliveryType: "MANUAL",
        warrantyDays: 30,
        instantDelivery: false,
        catalogOrder: 1,
        imageUrl: null,
      }],
      total: 1,
      priceRange: { minMinor: 129900, maxMinor: 129900, currency: "THB" },
    };

    expect(productResponseSchema.safeParse(payload).success).toBe(true);
  });
});
