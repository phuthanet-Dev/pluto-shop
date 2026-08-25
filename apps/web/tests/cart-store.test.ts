import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "@/stores/cart";

describe("cart persistence and hydration", () => {
  beforeEach(() => {
    useCartStore.persist.clearStorage();
    useCartStore.setState({ cartIds: [], quantities: {}, mode: "guest", hasHydrated: false });
  });

  it("hydrates only unique numeric product IDs and exposes hydration state", async () => {
    window.localStorage.setItem(
      "pluto-shop-cart",
      JSON.stringify({
        state: { cartIds: [2, "3", 2, -1, 4.5] },
        version: 0,
      }),
    );

    expect(useCartStore.getState().hasHydrated).toBe(false);
    await useCartStore.persist.rehydrate();

    expect(useCartStore.getState().cartIds).toEqual([2]);
    expect(useCartStore.getState().hasHydrated).toBe(true);
  });

  it("adds each product once, removes it, and persists numeric IDs with quantities", () => {
    useCartStore.getState().addToCart(7);
    useCartStore.getState().addToCart(7);
    useCartStore.getState().addToCart(11);

    expect(useCartStore.getState().cartIds).toEqual([7, 11]);
    useCartStore.getState().removeFromCart(7);
    expect(useCartStore.getState().cartIds).toEqual([11]);

    const saved = JSON.parse(
      window.localStorage.getItem("pluto-shop-cart") ?? "{}",
    ) as { state: Record<string, unknown> };
    expect(saved.state).toEqual({ cartIds: [11], quantities: { "11": 1 } });
  });

  it("does not persist account-owned items into the guest cart", () => {
    useCartStore.getState().setCartItems([{ productId: 1, quantity: 2 }], "account");

    const saved = JSON.parse(
      window.localStorage.getItem("pluto-shop-cart") ?? "{}",
    ) as { state: Record<string, unknown> };
    expect(useCartStore.getState().mode).toBe("account");
    expect(saved.state).toEqual({ cartIds: [], quantities: {} });
  });
});
