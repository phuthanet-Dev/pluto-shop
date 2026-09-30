import { proxyPaymentReadRequest } from "@/lib/payment-proxy";

export async function GET(request: Request): Promise<Response> {
  return proxyPaymentReadRequest(request, "/api/v1/payments/active");
}
