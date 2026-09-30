import { proxyPaymentRequest } from "@/lib/payment-proxy";

export async function POST(request: Request): Promise<Response> {
  return proxyPaymentRequest(request, "/api/v1/checkout/truewallet");
}
