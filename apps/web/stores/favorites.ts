import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type FavoritesState = {
  favoriteIds: number[];
  hasHydrated: boolean;
  toggleFavorite: (productId: number) => void;
  setHasHydrated: (value: boolean) => void;
};

function numericIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is number => Number.isSafeInteger(item) && Number(item) > 0,
      ),
    ),
  );
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favoriteIds: [],
      hasHydrated: false,
      toggleFavorite: (productId) => {
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        set((state) => ({
          favoriteIds: state.favoriteIds.includes(productId)
            ? state.favoriteIds.filter((id) => id !== productId)
            : [...state.favoriteIds, productId],
        }));
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "pluto-shop-favorites",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ favoriteIds: state.favoriteIds }),
      merge: (persisted, current) => ({
        ...current,
        favoriteIds: numericIds(
          (persisted as { favoriteIds?: unknown } | undefined)?.favoriteIds,
        ),
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
