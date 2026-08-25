import { NextResponse } from "next/server";

import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^\d+$/u.test(id) || Number(id) <= 0) {
    return NextResponse.json(
      { type: "about:blank", title: "Invalid product id", status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  return proxyAdminProductsRequest(request, `/${id}/stock`);
}
