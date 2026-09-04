import { parsePositiveId } from "@/lib/fulfillment-routes";
import { proxyFulfillmentRequest } from "@/lib/fulfillment-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function pathFor(context: Context): Promise<string | Response> {
  const { id: rawId } = await context.params;
  const id = parsePositiveId(rawId, "order");
  if (id instanceof Response) return id;
  return `/api/v1/orders/${id}/fulfillment`;
}

export async function GET(request: Request, context: Context) {
  const path = await pathFor(context);
  return path instanceof Response ? path : proxyFulfillmentRequest(request, path);
}
