import { notFound, redirect } from "next/navigation";

import { CustomerFulfillmentPanel } from "@/components/customer-fulfillment-panel";
import { getSession } from "@/lib/auth-server";
import { isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function parseOrderId(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function OrderFulfillmentPage({ params }: OrderPageProps) {
  const { locale, id: rawOrderId } = await params;
  if (!isLocale(locale)) notFound();
  const orderId = parseOrderId(rawOrderId);
  if (!orderId) notFound();

  const session = await getSession();
  if (!session) {
    const callbackUrl = `/${locale}/orders/${orderId}`;
    redirect(`/api/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return <CustomerFulfillmentPanel orderId={orderId} locale={locale} />;
}
