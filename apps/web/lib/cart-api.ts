import { z } from "zod";

import type { CartItemState } from "@/stores/cart";

const cartResponseSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive().max(99),
  }).strict()),
  removedProductIds: z.array(z.number().int().positive()),
  version: z.number().int().nonnegative(),
}).strict();

export type CartResponse = z.infer<typeof cartResponseSchema>;

export async function mergeCart(
  items: CartItemState[],
  fetcher: typeof fetch = fetch,
): Promise<CartResponse> {
  const response = await fetcher("/api/v1/cart/merge", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error(`Cart merge failed (${response.status})`);
  const parsed = cartResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Cart response was invalid");
  return parsed.data;
}

export async function fetchCart(fetcher: typeof fetch = fetch): Promise<CartResponse> {
  const response = await fetcher("/api/v1/cart", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Cart request failed (${response.status})`);
  const parsed = cartResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Cart response was invalid");
  return parsed.data;
}

export async function replaceCart(
  items: CartItemState[],
  fetcher: typeof fetch = fetch,
): Promise<CartResponse> {
  const response = await fetcher("/api/v1/cart", {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error(`Cart update failed (${response.status})`);
  const parsed = cartResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Cart response was invalid");
  return parsed.data;
}
