import type { ProductResponse } from "@/lib/products";

export const productResponse: ProductResponse = {
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
};
