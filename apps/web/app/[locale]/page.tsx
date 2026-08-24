import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Marketplace } from "@/components/marketplace";
import { isLocale, LOCALES } from "@/lib/i18n";

type LocalePageProps = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  return {
    title: "Pluto Shop",
    alternates: {
      canonical: `/${locale}`,
      languages: { th: "/th", en: "/en" },
    },
  };
}

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <Marketplace locale={locale} />;
}
