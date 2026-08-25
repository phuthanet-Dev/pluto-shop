import { proxyCartRequest } from "@/lib/cart-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyCartRequest(request, "/merge");
}
