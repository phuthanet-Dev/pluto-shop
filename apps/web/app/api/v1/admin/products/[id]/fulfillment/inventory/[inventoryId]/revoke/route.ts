import { parsePositiveId } from "@/lib/fulfillment-routes";
import { proxyFulfillmentRequest } from "@/lib/fulfillment-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; inventoryId: string }> };

async function pathFor(context: Context): Promise<string | Response> {
  const { id: rawProductId, inventoryId: rawInventoryId } = await context.params;
  const productId = parsePositiveId(rawProductId, "product");
  if (productId instanceof Response) return productId;
  const inventoryId = parsePositiveId(rawInventoryId, "inventory");
  if (inventoryId instanceof Response) return inventoryId;
  return `/api/v1/admin/products/${productId}/fulfillment/inventory/${inventoryId}/revoke`;
}

export async function POST(request: Request, context: Context) {
  const path = await pathFor(context);
  return path instanceof Response ? path : proxyFulfillmentRequest(request, path);
}
