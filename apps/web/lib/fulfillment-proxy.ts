import { NextResponse } from "next/server";
import { z } from "zod";

import { getAccessToken } from "@/lib/auth-server";

const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_PATH = /^\/api\/v1\/(?:admin\/fulfillments\/\d+\/(?:ready|retry)|admin\/products\/\d+\/fulfillment(?:\/inventory(?:\/import|\/\d+\/(?:reveal|revoke|quarantine))?)?|orders\/\d+\/fulfillment(?:\/items\/\d+\/reveal)?)$/u;

const ALLOWED_PROVIDERS = new Set(["DISCORD", "SYNTHETIC"]);
const providerSchema = z.string().min(1).max(64).refine(
  (provider) => ALLOWED_PROVIDERS.has(provider.toUpperCase()),
  "Provider is not allowed",
);
const publicMetadataSchema = z.object({
  region: z.string().min(1).max(200).optional(),
  externalLabel: z.string().min(1).max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  licenseTier: z.string().min(1).max(200).optional(),
}).strict().optional();
const secureInventorySchema = z.discriminatedUnion("fulfillmentType", [
  z.object({
    fulfillmentType: z.literal("DISCORD_ACCOUNT"),
    provider: providerSchema,
    payload: z.object({ email: z.string().email().max(320), password: z.string().min(1).max(2048) }).strict(),
    publicMetadata: publicMetadataSchema,
  }).strict(),
  z.object({
    fulfillmentType: z.literal("LICENSE_KEY"),
    provider: providerSchema,
    payload: z.object({ licenseKey: z.string().min(1).max(2048) }).strict(),
    publicMetadata: publicMetadataSchema,
  }).strict(),
  z.object({
    fulfillmentType: z.literal("INVITE_URL"),
    provider: providerSchema,
    payload: z.object({ inviteUrl: z.string().url().max(2048) }).strict(),
    publicMetadata: publicMetadataSchema,
  }).strict(),
  z.object({
    fulfillmentType: z.literal("REDEEM_CODE"),
    provider: providerSchema,
    payload: z.object({ code: z.string().min(1).max(2048) }).strict(),
    publicMetadata: publicMetadataSchema,
  }).strict(),
]);
const fulfillmentStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  audience: z.enum(["CUSTOMER", "OPERATOR"]),
  titleTh: z.string().min(1).max(180),
  titleEn: z.string().min(1).max(180),
  bodyTh: z.string().min(1).max(4000),
  bodyEn: z.string().min(1).max(4000),
  linkUrl: z.string().url().max(2048).nullable(),
  enabled: z.boolean(),
}).strict();
const profileWriteSchema = z.object({
  fulfillmentType: z.enum(["NONE", "DISCORD_ACCOUNT", "LICENSE_KEY", "INVITE_URL", "REDEEM_CODE", "MANUAL_INSTRUCTION"]),
  provider: providerSchema.nullable(),
  payloadSchemaVersion: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  steps: z.array(fulfillmentStepSchema).max(50).optional(),
}).strict();
const reasonSchema = z.object({
  reason: z.enum(["CUSTOMER_SUPPORT", "INCIDENT_RESPONSE", "INVENTORY_AUDIT", "FULFILLMENT_RECOVERY"]),
}).strict();
const emptyObjectSchema = z.object({}).strict();

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
  }
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: "about:blank", title, status },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

function isSafeUpstreamPath(upstreamPath: string): boolean {
  if (!ALLOWED_PATH.test(upstreamPath)) return false;
  const ids = upstreamPath.match(/\d+/gu) ?? [];
  return ids.every((id) => {
    const numeric = Number(id);
    return Number.isSafeInteger(numeric) && numeric > 0;
  });
}

function sameSiteMutation(request: Request): boolean {
  if (request.method === "GET") return true;
  return request.headers.get("origin") === (process.env.SITE_URL ?? "http://127.0.0.1:3000");
}

async function readBody(request: Request): Promise<ArrayBuffer> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
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
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
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

function bodySchema(method: string, upstreamPath: string): z.ZodType | undefined {
  if (method === "PUT" && /\/admin\/products\/\d+\/fulfillment$/u.test(upstreamPath)) {
    return profileWriteSchema;
  }
  if (method === "POST" && /\/fulfillment\/inventory$/u.test(upstreamPath)) {
    return secureInventorySchema;
  }
  if (method === "POST" && /\/fulfillment\/inventory\/import$/u.test(upstreamPath)) {
    return z.object({ items: z.array(secureInventorySchema).min(1).max(100) }).strict();
  }
  if (method === "POST" && /\/inventory\/\d+\/(?:reveal|revoke|quarantine)$/u.test(upstreamPath)) {
    return reasonSchema;
  }
  if (method === "POST") return emptyObjectSchema;
  return undefined;
}

function validBody(body: ArrayBuffer, schema: z.ZodType | undefined): boolean {
  if (!schema) return true;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return schema.safeParse(JSON.parse(decoded)).success;
  } catch {
    return false;
  }
}

export async function proxyFulfillmentRequest(
  request: Request,
  upstreamPath: string,
): Promise<Response> {
  if (!isSafeUpstreamPath(upstreamPath)) return problem(400, "Invalid fulfillment path");
  if (!sameSiteMutation(request)) return problem(403, "CSRF origin rejected");

  const accessToken = await getAccessToken();
  if (!accessToken) return problem(401, "Unauthorized");

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (request.method !== "GET" && !contentType.startsWith("application/json")) {
    return problem(415, "Unsupported fulfillment request content type");
  }

  try {
    const requestBody = request.method === "GET" ? undefined : await readBody(request);
    if (requestBody && !validBody(requestBody, bodySchema(request.method, upstreamPath))) {
      return problem(400, "Invalid fulfillment request body");
    }
    const internalApiUrl = process.env.INTERNAL_API_URL;
    if (!internalApiUrl) return problem(502, "Fulfillment service unavailable");
    const base = new URL(internalApiUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return problem(502, "Fulfillment service unavailable");
    }
    const upstreamUrl = new URL(upstreamPath, `${base.origin}/`).toString();
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    });
    if (request.method !== "GET") headers.set("content-type", request.headers.get("content-type") ?? "application/json");

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
      if (refreshedToken && refreshedToken !== accessToken) upstream = await send(refreshedToken);
    }

    const responseHeaders = new Headers();
    for (const name of ["content-type", "cache-control", "x-content-type-options"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("cache-control", "no-store");
    const responseBody = upstream.status === 204 ? undefined : await upstream.arrayBuffer();
    return new NextResponse(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return problem(413, "Request entity too large");
    return problem(502, "Fulfillment service unavailable");
  }
}
