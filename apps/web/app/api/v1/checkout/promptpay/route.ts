import { proxyPaymentRequest } from "@/lib/payment-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyPaymentRequest(request, "/api/v1/checkout/promptpay");
}
