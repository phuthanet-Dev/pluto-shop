import { z } from "zod";
import type { Filters } from "@/lib/url-filters";
import { filtersToApiSearchParams } from "@/lib/url-filters";

const localizedName = z.string().trim().min(1).max(200);
const description = z.string().trim().min(1).max(2_000);

export const productSchema = z
  .object({
    id: z.number().int().positive().safe(),
    slug: z.string().trim().min(1).max(200),
    nameTh: localizedName,
    nameEn: localizedName,
    descriptionTh: description,
    descriptionEn: description,
    visualCode: z.string().trim().min(1).max(80),
    type: z.enum(["SINGLE", "BUNDLE"]),
    selectionMode: z.enum(["SINGLE_OPTION", "MULTI_OPTION"]),
    optionGroup: z.string().trim().min(1).max(120).nullable(),
    optionLabelTh: localizedName.nullable(),
    optionLabelEn: localizedName.nullable(),
    priceMinor: z.number().int().nonnegative().safe(),
    currency: z.literal("THB"),
    stockQuantity: z.number().int().nonnegative().safe(),
    bundleItemCount: z.number().int().positive().safe().nullable(),
    instantDelivery: z.boolean(),
    catalogOrder: z.number().int().nonnegative().safe(),
  })
  .strict();

export const productResponseSchema = z
  .object({
    items: z.array(productSchema).max(500),
    total: z.number().int().nonnegative().safe(),
    priceRange: z
      .object({
        minMinor: z.number().int().nonnegative().safe(),
        maxMinor: z.number().int().nonnegative().safe(),
        currency: z.literal("THB"),
      })
      .strict(),
  })
  .strict();

export type Product = z.infer<typeof productSchema>;
export type ProductResponse = z.infer<typeof productResponseSchema>;

export async function fetchProducts(
  filters: Filters,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ProductResponse> {
  const query = filtersToApiSearchParams(filters).toString();
  const response = await fetcher(`/api/v1/products${query ? `?${query}` : ""}`, {
    headers: { accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Product API request failed (${response.status})`);
  }

  const parsed = productResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Product API response was invalid");
  }

  return parsed.data;
}

export function productName(product: Product, locale: "th" | "en"): string {
  return locale === "th" ? product.nameTh : product.nameEn;
}

export function productDescription(
  product: Product,
  locale: "th" | "en",
): string {
  return locale === "th" ? product.descriptionTh : product.descriptionEn;
}

export function productOptionLabel(product: Product, locale: "th" | "en"): string {
  if (locale === "th" && product.optionLabelTh) return product.optionLabelTh;
  if (locale === "en" && product.optionLabelEn) return product.optionLabelEn;
  return productName(product, locale);
}
