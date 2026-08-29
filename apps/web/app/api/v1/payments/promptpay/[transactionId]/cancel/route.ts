import { NextResponse } from "next/server";

import { proxyPaymentRequest } from "@/lib/payment-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ transactionId: string }> };

export async function POST(request: Request, context: Context) {
  const { transactionId } = await context.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(transactionId)) {
    return NextResponse.json(
      { type: "about:blank", title: "Invalid payment transaction", status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  return proxyPaymentRequest(
    request,
    `/api/v1/payments/promptpay/${encodeURIComponent(transactionId)}/cancel`,
  );
}
