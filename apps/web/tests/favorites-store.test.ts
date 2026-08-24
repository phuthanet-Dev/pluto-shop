import { beforeEach, describe, expect, it } from "vitest";
import { useFavoritesStore } from "@/stores/favorites";

describe("favorites persistence and hydration", () => {
  beforeEach(() => {
    useFavoritesStore.persist.clearStorage();
    useFavoritesStore.setState({ favoriteIds: [], hasHydrated: false });
  });

  it("hydrates only unique numeric product IDs and exposes hydration state", async () => {
    window.localStorage.setItem(
      "pluto-shop-favorites",
      JSON.stringify({
        state: { favoriteIds: [2, "3", 2, -1, 4.5] },
        version: 0,
      }),
    );

    expect(useFavoritesStore.getState().hasHydrated).toBe(false);
    await useFavoritesStore.persist.rehydrate();

    expect(useFavoritesStore.getState().favoriteIds).toEqual([2]);
    expect(useFavoritesStore.getState().hasHydrated).toBe(true);
  });

  it("persists no product data beyond numeric favorite IDs", () => {
    useFavoritesStore.getState().toggleFavorite(7);
    useFavoritesStore.getState().toggleFavorite(11);

    const saved = JSON.parse(
      window.localStorage.getItem("pluto-shop-favorites") ?? "{}",
    ) as { state: Record<string, unknown> };
    expect(saved.state).toEqual({ favoriteIds: [7, 11] });
    expect(Object.values(saved.state).flat()).toEqual([7, 11]);
  });
});
