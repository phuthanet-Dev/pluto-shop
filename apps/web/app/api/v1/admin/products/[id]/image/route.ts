import { NextResponse } from "next/server";

import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function suffixFor(context: Context): Promise<string | Response> {
  const { id } = await context.params;
  if (!/^\d+$/u.test(id) || Number(id) <= 0) {
    return NextResponse.json(
      { type: "about:blank", title: "Invalid product id", status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  return `/${id}/image`;
}

export async function GET(request: Request, context: Context) {
  const suffix = await suffixFor(context);
  return suffix instanceof Response ? suffix : proxyAdminProductsRequest(request, suffix);
}

export async function POST(request: Request, context: Context) {
  const suffix = await suffixFor(context);
  return suffix instanceof Response ? suffix : proxyAdminProductsRequest(request, suffix);
}

export async function DELETE(request: Request, context: Context) {
  const suffix = await suffixFor(context);
  return suffix instanceof Response ? suffix : proxyAdminProductsRequest(request, suffix);
}
