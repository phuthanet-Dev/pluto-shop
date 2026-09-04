import { NextResponse } from "next/server";

import { proxyAdminProductsRequest } from "@/lib/admin-products-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ optionGroup: string }> };

function isSafeOptionGroup(optionGroup: string): boolean {
  const normalized = optionGroup.trim();
  return normalized.length > 0
    && normalized.length <= 120
    && normalized !== "."
    && normalized !== ".."
    && !/[\u0000-\u001f\u007f/\\?#]/u.test(normalized);
}

async function suffixFor(context: Context, suffix = ""): Promise<string | Response> {
  const { optionGroup } = await context.params;
  if (!isSafeOptionGroup(optionGroup)) {
    return NextResponse.json(
      { type: "about:blank", title: "Invalid option group", status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  return `/multi/${encodeURIComponent(optionGroup.trim())}${suffix}`;
}

export async function GET(request: Request, context: Context) {
  const suffix = await suffixFor(context);
  return suffix instanceof Response ? suffix : proxyAdminProductsRequest(request, suffix);
}

export async function PATCH(request: Request, context: Context) {
  const suffix = await suffixFor(context);
  return suffix instanceof Response ? suffix : proxyAdminProductsRequest(request, suffix);
}
