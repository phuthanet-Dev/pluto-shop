import type { ProductResponse } from "@/lib/products";

export const productResponse: ProductResponse = {
  items: [
    {
      id: 1,
      slug: "pluto-glyphs",
      nameTh: "ชุดไอคอนพลูโต",
      nameEn: "Pluto Glyph Set",
      shortDescriptionTh: "คำโปรยสั้นสำหรับชุดไอคอนพลูโต",
      shortDescriptionEn: "A short summary for the Pluto Glyph Set",
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
      imageUrl: null,
    },
  ],
  total: 1,
  priceRange: { minMinor: 129900, maxMinor: 129900, currency: "THB" },
};
