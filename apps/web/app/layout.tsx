import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const metadataBase = new URL(process.env.SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: "Pluto Shop",
  description:
    "Explore creator-friendly digital assets with instant delivery at Pluto Shop.",
  applicationName: "Pluto Shop",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "Pluto Shop",
    title: "Pluto Shop",
    description:
      "Curated digital goods for designers, developers, and visual storytellers.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Pluto Shop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pluto Shop",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
