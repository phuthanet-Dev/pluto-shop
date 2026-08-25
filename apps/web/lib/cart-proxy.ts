import { NextResponse } from "next/server";

import { getAccessToken } from "@/lib/auth-server";

const CART_API_PATH = "/api/v1/cart";

export async function proxyCartRequest(request: Request, suffix = ""): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { type: "about:blank", title: "Unauthorized", status: 401 },
      { status: 401, headers: { "content-type": "application/problem+json" } },
    );
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
  });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const body = request.method === "GET" || request.method === "DELETE"
    ? undefined
    : await request.text();

  try {
    const upstream = await fetch(`${process.env.INTERNAL_API_URL}${CART_API_PATH}${suffix}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { type: "about:blank", title: "Cart service unavailable", status: 502 },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }
}
