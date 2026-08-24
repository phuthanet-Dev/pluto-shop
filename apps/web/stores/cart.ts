import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CartState = {
  cartIds: number[];
  hasHydrated: boolean;
  addToCart: (productId: number) => void;
  removeFromCart: (productId: number) => void;
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

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      cartIds: [],
      hasHydrated: false,
      addToCart: (productId) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        set((state) => ({
          cartIds: state.cartIds.includes(productId)
            ? state.cartIds
            : [...state.cartIds, productId],
        }));
      },
      removeFromCart: (productId) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        set((state) => ({
          cartIds: state.cartIds.filter((id) => id !== productId),
        }));
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "pluto-shop-cart",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ cartIds: state.cartIds }),
      merge: (persisted, current) => ({
        ...current,
        cartIds: numericIds(
          (persisted as { cartIds?: unknown } | undefined)?.cartIds,
        ),
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
