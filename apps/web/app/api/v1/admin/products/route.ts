import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyAdminProductsRequest(request);
}

export async function POST(request: Request) {
  return proxyAdminProductsRequest(request);
}
