import { SITE_BRAND_DISPLAY } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const metadataBase = new URL(process.env.SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: SITE_BRAND_DISPLAY,
  description:
    `Explore creator-friendly digital assets with instant delivery at ${SITE_BRAND_DISPLAY}.`,
  applicationName: SITE_BRAND_DISPLAY,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: SITE_BRAND_DISPLAY,
    title: SITE_BRAND_DISPLAY,
    description:
      "Curated digital goods for designers, developers, and visual storytellers.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: SITE_BRAND_DISPLAY,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_BRAND_DISPLAY,
    description: "Curated digital goods for creative people.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#07070a",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-pluto-locale") === "en" ? "en" : "th";

  return (
    <html lang={locale}>
      <body>
        {process.env.DEPLOYMENT_ENV === "dev" && (
          <aside role="note" style={{ padding: "10px 16px", background: "#713f12", color: "#fff", textAlign: "center", fontSize: "14px" }}>
            ระบบอยู่ระหว่างพัฒนา — การชำระเงินใช้เงินจริง
          </aside>
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
