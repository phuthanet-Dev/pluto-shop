import { parsePositiveId } from "@/lib/fulfillment-routes";
import { proxyFulfillmentRequest } from "@/lib/fulfillment-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; itemId: string }> };

async function pathFor(context: Context): Promise<string | Response> {
  const { id: rawOrderId, itemId: rawItemId } = await context.params;
  const orderId = parsePositiveId(rawOrderId, "order");
  if (orderId instanceof Response) return orderId;
  const itemId = parsePositiveId(rawItemId, "order item");
  if (itemId instanceof Response) return itemId;
  return `/api/v1/orders/${orderId}/fulfillment/items/${itemId}/reveal`;
}

export async function POST(request: Request, context: Context) {
  const path = await pathFor(context);
  return path instanceof Response ? path : proxyFulfillmentRequest(request, path);
}
