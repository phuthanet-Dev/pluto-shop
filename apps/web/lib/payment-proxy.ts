import { NextResponse } from "next/server";

import { getAccessToken } from "@/lib/auth-server";

function sameSiteMutation(request: Request): boolean {
  return request.headers.get("origin") === (process.env.SITE_URL ?? "http://127.0.0.1:3000");
}

export async function proxyPaymentRequest(request: Request, upstreamPath: string): Promise<Response> {
  if (!sameSiteMutation(request)) {
    return NextResponse.json(
      { type: "about:blank", title: "CSRF origin rejected", status: 403 },
      { status: 403, headers: { "content-type": "application/problem+json" } },
    );
  }

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
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const body = await request.text();
  try {
    const upstreamUrl = `${process.env.INTERNAL_API_URL}${upstreamPath}`;
    const send = (token: string) => {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("authorization", `Bearer ${token}`);
      return fetch(upstreamUrl, {
        method: request.method,
        headers: retryHeaders,
        body,
        cache: "no-store",
      });
    };
    let upstream = await send(accessToken);
    if (upstream.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken && refreshedToken !== accessToken) {
        upstream = await send(refreshedToken);
      }
    }
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { type: "about:blank", title: "Payment service unavailable", status: 502 },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }
}
