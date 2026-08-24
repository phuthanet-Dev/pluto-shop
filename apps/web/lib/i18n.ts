export const LOCALES = ["th", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function formatThb(priceMinor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
  }).format(priceMinor / 100);
}

export function getLocaleSwitchHref(
  pathname: string,
  targetLocale: Locale,
  searchParams: URLSearchParams,
): string {
  const segments = pathname.split("/");
  if (segments.length > 1 && isLocale(segments[1] ?? "")) {
    segments[1] = targetLocale;
  } else {
    segments.splice(1, 0, targetLocale);
  }

  const query = searchParams.toString();
  return `${segments.join("/") || "/"}${query ? `?${query}` : ""}`;
}
