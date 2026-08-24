import { z } from "zod";

export const FILTER_KEYS = ["q", "maxPriceMinor", "inStock"] as const;

export type Filters = {
  q: string;
  maxPriceMinor?: number;
  inStock: boolean;
};

const querySchema = z.string().trim().max(120).catch("");
const maxPriceSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());

export const filterFormSchema = z.object({
  q: z.string().trim().max(120),
  maxPriceMinor: z.number().int().nonnegative().optional(),
  inStock: z.boolean(),
});

export function parseFilters(searchParams: URLSearchParams): Filters {
  const maxPriceResult = maxPriceSchema.safeParse(
    searchParams.get("maxPriceMinor") ?? "",
  );

  return {
    q: querySchema.parse(searchParams.get("q") ?? ""),
    maxPriceMinor: maxPriceResult.success ? maxPriceResult.data : undefined,
    inStock: searchParams.get("inStock") === "true",
  };
}

export function filtersToApiSearchParams(filters: Filters): URLSearchParams {
  const result = new URLSearchParams();
  if (filters.q) result.set("q", filters.q);
  if (filters.maxPriceMinor !== undefined) {
    result.set("maxPriceMinor", String(filters.maxPriceMinor));
  }
  if (filters.inStock) result.set("inStock", "true");
  return result;
}

export function getFilterHref(
  pathname: string,
  current: URLSearchParams,
  update: Partial<Filters> | "reset",
): string {
  const next = new URLSearchParams(current);

  if (update === "reset") {
    for (const key of FILTER_KEYS) next.delete(key);
  } else {
    if ("q" in update) {
      const q = update.q?.trim() ?? "";
      if (q) {
        next.set("q", q);
      } else {
        next.delete("q");
      }
    }
    if ("maxPriceMinor" in update) {
      if (update.maxPriceMinor === undefined) {
        next.delete("maxPriceMinor");
      } else {
        next.set("maxPriceMinor", String(update.maxPriceMinor));
      }
    }
    if ("inStock" in update) {
      if (update.inStock) {
        next.set("inStock", "true");
      } else {
        next.delete("inStock");
      }
    }
  }

  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
