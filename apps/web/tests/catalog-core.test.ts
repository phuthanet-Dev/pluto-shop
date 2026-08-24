import { describe, expect, it } from "vitest";
import { formatThb, getLocaleSwitchHref } from "@/lib/i18n";
import {
  FILTER_KEYS,
  filtersToApiSearchParams,
  getFilterHref,
  parseFilters,
} from "@/lib/url-filters";

describe("locale and currency behavior", () => {
  it("formats minor units as THB with the active locale", () => {
    expect(formatThb(129900, "th")).toBe("฿1,299.00");
    expect(formatThb(129900, "en")).toBe("THB\u00a01,299.00");
  });

  it("switches locale without losing any query parameters", () => {
    const current = new URLSearchParams(
      "q=motion+kit&maxPriceMinor=240000&inStock=true&ref=home",
    );

    expect(getLocaleSwitchHref("/th", "en", current)).toBe(
      "/en?q=motion+kit&maxPriceMinor=240000&inStock=true&ref=home",
    );
  });
});

describe("URL filter semantics", () => {
  it("accepts only bounded, API-safe filter values", () => {
    const parsed = parseFilters(
      new URLSearchParams({
        q: `  ${"a".repeat(140)}  `,
        maxPriceMinor: "125000.5",
        inStock: "yes",
      }),
    );

    expect(parsed).toEqual({ q: "", maxPriceMinor: undefined, inStock: false });
    expect(filtersToApiSearchParams(parsed).toString()).toBe("");
  });

  it("serializes active filters with the API contract keys", () => {
    const parsed = parseFilters(
      new URLSearchParams({
        q: "  icon set  ",
        maxPriceMinor: "125000",
        inStock: "true",
      }),
    );

    expect(filtersToApiSearchParams(parsed).toString()).toBe(
      "q=icon+set&maxPriceMinor=125000&inStock=true",
    );
  });

  it("reset removes filter keys but preserves the path and unrelated query", () => {
    const current = new URLSearchParams(
      "q=icons&maxPriceMinor=50000&inStock=true&ref=launch",
    );

    expect(getFilterHref("/th", current, "reset")).toBe("/th?ref=launch");
    expect(FILTER_KEYS).toEqual(["q", "maxPriceMinor", "inStock"]);
  });
});
