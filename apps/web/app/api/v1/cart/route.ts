import { proxyCartRequest } from "@/lib/cart-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyCartRequest(request);
}

export async function PUT(request: Request) {
  return proxyCartRequest(request);
}

export async function DELETE(request: Request) {
  return proxyCartRequest(request);
}
