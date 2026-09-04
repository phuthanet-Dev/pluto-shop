import { NextResponse } from "next/server";

import { getAccessToken } from "@/lib/auth-server";

const ADMIN_PRODUCTS_PATH = "/api/v1/admin/products";
const MAX_MULTIPART_BODY_BYTES = 6 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
  }
}

async function readRequestBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declaredLength = request.headers.get("content-length");
  const parsedLength = declaredLength === null ? Number.NaN : Number(declaredLength);
  if (parsedLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request is already being rejected; cancellation is best effort.
        }
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function readRequestText(request: Request): Promise<string> {
  const body = await readRequestBody(request, MAX_JSON_BODY_BYTES);
  return new TextDecoder().decode(body);
}

function sameSiteMutation(request: Request): boolean {
  if (request.method === "GET") return true;
  return request.headers.get("origin") === (process.env.SITE_URL ?? "http://127.0.0.1:3000");
}

function allowedQuery(request: Request, suffix: string): string {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  if (request.method === "GET" && suffix === "") {
    const query = incoming.get("q");
    if (query !== null) forwarded.set("q", query);
  }
  if (request.method === "DELETE" || (request.method === "POST" && suffix.endsWith("/image"))) {
    const version = incoming.get("version");
    if (version !== null && /^\d+$/u.test(version)) forwarded.set("version", version);
  }
  const query = forwarded.toString();
  return query ? `?${query}` : "";
}

export async function proxyAdminProductsRequest(
  request: Request,
  suffix = "",
): Promise<Response> {
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
  try {
    const requestBody = request.method === "GET" || request.method === "DELETE"
      ? undefined
      : contentType?.toLowerCase().startsWith("multipart/form-data")
        ? await readRequestBody(request, MAX_MULTIPART_BODY_BYTES)
        : await readRequestText(request);
    const upstreamUrl = `${process.env.INTERNAL_API_URL}${ADMIN_PRODUCTS_PATH}${suffix}${allowedQuery(request, suffix)}`;
    const send = (token: string) => {
      const retryHeaders = new Headers(headers);
      retryHeaders.set("authorization", `Bearer ${token}`);
      return fetch(upstreamUrl, {
        method: request.method,
        headers: retryHeaders,
        body: requestBody,
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
    for (const headerName of [
      "content-type",
      "content-length",
      "cache-control",
      "content-disposition",
      "x-content-type-options",
    ]) {
      const value = upstream.headers.get(headerName);
      if (value) responseHeaders.set(headerName, value);
    }
    const responseBody = upstream.status === 204
      ? undefined
      : upstreamContentType?.toLowerCase().startsWith("image/")
        ? await upstream.arrayBuffer()
        : await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { type: "about:blank", title: "Request entity too large", status: 413 },
        { status: 413, headers: { "content-type": "application/problem+json" } },
      );
    }
    return NextResponse.json(
      { type: "about:blank", title: "Admin product service unavailable", status: 502 },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }
}
