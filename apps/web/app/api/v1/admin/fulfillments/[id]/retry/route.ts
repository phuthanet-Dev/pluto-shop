import { parsePositiveId } from "@/lib/fulfillment-routes";
import { proxyFulfillmentRequest } from "@/lib/fulfillment-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function pathFor(context: Context): Promise<string | Response> {
  const { id: rawId } = await context.params;
  const id = parsePositiveId(rawId, "fulfillment");
  if (id instanceof Response) return id;
  return `/api/v1/admin/fulfillments/${id}/retry`;
}

export async function POST(request: Request, context: Context) {
  const path = await pathFor(context);
  return path instanceof Response ? path : proxyFulfillmentRequest(request, path);
}
