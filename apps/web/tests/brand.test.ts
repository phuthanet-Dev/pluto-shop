import { describe, expect, it } from "vitest";
import { SITE_BRAND, SITE_BRAND_DISPLAY } from "@/lib/brand";
import { metadata } from "@/app/layout";
import { generateMetadata } from "@/app/[locale]/page";

it("brands document and social metadata without changing the base URL", () => {
  expect(metadata.title).toBe(SITE_BRAND_DISPLAY);
  expect(metadata.applicationName).toBe(SITE_BRAND_DISPLAY);
  expect(metadata.description).toContain(SITE_BRAND_DISPLAY);
  expect(metadata.metadataBase?.toString()).toBe(new URL(process.env.SITE_URL ?? "http://localhost:3000").href);
  expect(metadata.openGraph).toMatchObject({ title: SITE_BRAND_DISPLAY, siteName: SITE_BRAND_DISPLAY, images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_BRAND_DISPLAY }] });
  expect(metadata.twitter).toMatchObject({ title: SITE_BRAND_DISPLAY, images: ["/og.png"] });
});

it.each(["th", "en"])("brands %s metadata while preserving locale links", async (locale) => {
  expect(await generateMetadata({ params: Promise.resolve({ locale }) })).toEqual({
    title: SITE_BRAND_DISPLAY,
    alternates: { canonical: `/${locale}`, languages: { th: "/th", en: "/en" } },
  });
});

it("does not create metadata for unsupported locales", async () => {
  expect(await generateMetadata({ params: Promise.resolve({ locale: "invalid" }) })).toEqual({});
});

describe("public brand", () => {
  it("uses the exact requested website name", () => {
    expect(SITE_BRAND).toBe("phutoshop");
    expect(SITE_BRAND_DISPLAY).toBe("Phuto Shop");
  });
});
