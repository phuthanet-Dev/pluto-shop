import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CartItemState = {
  productId: number;
  quantity: number;
};

export type CartMode = "guest" | "account";

type CartState = {
  cartIds: number[];
  quantities: Record<string, number>;
  mode: CartMode;
  hasHydrated: boolean;
  addToCart: (productId: number, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  setCartItems: (items: CartItemState[], mode?: CartMode) => void;
  setQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  setHasHydrated: (value: boolean) => void;
};

function numericIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is number => Number.isSafeInteger(item) && item > 0,
      ),
    ),
  );
}

function numericQuantities(value: unknown, ids: number[]): Record<string, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    ids.map((id) => {
      const candidate = source[String(id)];
      const quantity = typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
        ? Math.min(99, candidate)
        : 1;
      return [String(id), quantity];
    }),
  );
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      cartIds: [],
      quantities: {},
      mode: "guest",
      hasHydrated: false,
      addToCart: (productId, quantity = 1) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        const normalizedQuantity = Number.isSafeInteger(quantity) && quantity > 0
          ? Math.min(99, quantity)
          : 1;
        set((state) => ({
          cartIds: state.cartIds.includes(productId)
            ? state.cartIds
            : [...state.cartIds, productId],
          quantities: state.cartIds.includes(productId)
            ? state.quantities
            : { ...state.quantities, [String(productId)]: normalizedQuantity },
        }));
      },
      removeFromCart: (productId) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        set((state) => {
          const quantities = { ...state.quantities };
          delete quantities[String(productId)];
          return {
            cartIds: state.cartIds.filter((id) => id !== productId),
            quantities,
          };
        });
      },
      setCartItems: (items, mode = "guest") => {
        const valid = items.filter(
          (item) => Number.isSafeInteger(item.productId) && item.productId > 0 &&
            Number.isSafeInteger(item.quantity) && item.quantity > 0,
        );
        set({
          cartIds: valid.map((item) => item.productId),
          mode,
          quantities: Object.fromEntries(
            valid.map((item) => [String(item.productId), Math.min(99, item.quantity)]),
          ),
        });
      },
      setQuantity: (productId, quantity) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          set((state) => ({
            cartIds: state.cartIds.filter((id) => id !== productId),
            quantities: Object.fromEntries(
              Object.entries(state.quantities).filter(([id]) => id !== String(productId)),
            ),
          }));
          return;
        }
        set((state) => state.cartIds.includes(productId)
          ? { quantities: { ...state.quantities, [String(productId)]: Math.min(99, quantity) } }
          : state);
      },
      clearCart: () => set({ cartIds: [], quantities: {}, mode: "guest" }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "pluto-shop-cart",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        cartIds: state.mode === "guest" ? state.cartIds : [],
        quantities: state.mode === "guest" ? state.quantities : {},
      }),
      merge: (persisted, current) => ({
        ...current,
        cartIds: numericIds((persisted as { cartIds?: unknown } | undefined)?.cartIds),
        quantities: numericQuantities(
          (persisted as { quantities?: unknown } | undefined)?.quantities,
          numericIds((persisted as { cartIds?: unknown } | undefined)?.cartIds),
        ),
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
