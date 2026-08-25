import { expect, test } from "@playwright/test";

async function expectFullCatalog(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("result-count")).toHaveText("36 results");
  await expect(page.locator(".product-card")).toHaveCount(36);
}

async function tabUntil(
  page: import("@playwright/test").Page,
  selector: string,
  maxTabs = 80,
) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const matches = await page.evaluate(
      (target) => document.activeElement?.matches(target) ?? false,
      selector,
    );
    if (matches) return;
  }
  throw new Error(`Keyboard focus never reached ${selector}`);
}

test.describe("Pluto Shop marketplace", () => {
  test("protects admin and exposes OIDC login and signup redirects", async ({ page }) => {
    const session = await page.request.get("/api/auth/session");
    expect(session.status()).toBe(200);
    expect(await session.json()).toEqual({ authenticated: false });

    const login = await page.request.get("/api/auth/login?callbackUrl=%2Fadmin", {
      maxRedirects: 0,
    });
    expect(login.status()).toBe(307);
    const loginLocation = login.headers().location ?? "";
    expect(loginLocation).toContain("127.0.0.1:8081/realms/pluto");
    expect(loginLocation).toContain("code_challenge=");
    expect(loginLocation).toContain("scope=openid+profile+email+roles");
    expect(loginLocation).not.toContain("client_secret");
    const keycloakLogin = await page.request.get(loginLocation);
    expect(keycloakLogin.status()).toBe(200);
    const keycloakHtml = await keycloakLogin.text();
    expect(keycloakHtml).toContain("/pluto/");
    expect(keycloakHtml).toContain("pluto.css");

    const staleCallback = await page.request.get("/api/auth/callback?state=stale", {
      maxRedirects: 0,
    });
    expect(staleCallback.status()).toBe(307);
    expect(staleCallback.headers().location).toBe(
      "http://127.0.0.1:3000/api/auth/login?callbackUrl=%2Fadmin",
    );

    const signup = await page.request.get("/api/auth/signup?callbackUrl=%2Fadmin", {
      maxRedirects: 0,
    });
    expect(signup.status()).toBe(307);
    expect(signup.headers().location ?? "").toContain("kc_action=register");

    const admin = await page.request.get("/admin", { maxRedirects: 0 });
    expect(admin.status()).toBe(307);
    expect(admin.headers().location).toBe("/api/auth/login?callbackUrl=%2Fadmin");

    const logout = await page.request.get("/api/auth/logout", { maxRedirects: 0 });
    expect(logout.status()).toBe(307);
    const logoutLocation = new URL(logout.headers().location ?? "");
    expect(logoutLocation.pathname).toContain("/protocol/openid-connect/logout");
    expect(logoutLocation.searchParams.get("client_id")).toBe("pluto-web");
    expect(logoutLocation.searchParams.get("post_logout_redirect_uri")).toBe(
      "http://127.0.0.1:3000/api/auth/logout/callback?callbackUrl=%2Fth",
    );
    expect(logout.headers()["set-cookie"] ?? "").not.toContain("pluto_session=");

    const logoutCallback = await page.request.get(
      "/api/auth/logout/callback?callbackUrl=%2Fth",
      { maxRedirects: 0 },
    );
    expect(logoutCallback.status()).toBe(307);
    expect(logoutCallback.headers().location).toBe("http://127.0.0.1:3000/th");
    expect(logoutCallback.headers()["set-cookie"] ?? "").toContain("pluto_session=");
  });

  test("renders the real 36-item catalog in 9 × 4 order", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expectFullCatalog(page);

    const rowCounts = await page.locator(".product-card").evaluateAll((cards) => {
      const rows = new Map<number, number>();
      for (const card of cards) {
        const top = Math.round(card.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      return [...rows.values()];
    });
    expect(rowCounts).toEqual(Array.from({ length: 9 }, () => 4));
    await expect(page.locator(".card-meta .in-stock")).toHaveCount(36);
  });

  test("keeps detail artwork inside its grid column", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expectFullCatalog(page);

    await page.locator(".detail-button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const layout = await dialog.evaluate((element) => {
      const artwork = element.querySelector<HTMLElement>(
        ".dialog-art-column .product-art",
      );
      const copy = element.querySelector<HTMLElement>(".dialog-copy-column");
      if (!artwork || !copy) throw new Error("Missing detail dialog columns");
      const artworkBox = artwork.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      return {
        artworkRight: artworkBox.right,
        copyLeft: copyBox.left,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });

    expect(layout.artworkRight).toBeLessThanOrEqual(layout.copyLeft + 1);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test("real search and price filters change the API result count", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expectFullCatalog(page);

    await page.getByRole("searchbox", { name: "Search assets" }).fill("__no_such_asset__");
    await expect(page).toHaveURL(/q=__no_such_asset__/);
    await expect(page.getByTestId("result-count")).toHaveText("0 results");

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expectFullCatalog(page);

    await page.getByRole("textbox", { name: "Maximum price (THB)" }).fill("0");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/maxPriceMinor=0/);
    await expect(page.getByTestId("result-count")).not.toHaveText("36 results");
  });

  test("refresh preserves locale, query, and numeric-only cart IDs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expectFullCatalog(page);

    await page.evaluate(() => {
      localStorage.setItem(
        "pluto-shop-cart",
        JSON.stringify({ state: { cartIds: [1] }, version: 0 }),
      );
    });
    await page.getByRole("searchbox", { name: "Search assets" }).fill("__persist_probe__");
    await expect(page).toHaveURL(/q=__persist_probe__/);
    await page.locator('a[hreflang="th"]').click();
    await expect(page).toHaveURL(/\/th\?q=__persist_probe__/);
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    await expect(page.locator(".skip-link")).toHaveText("ข้ามไปยังเนื้อหา");

    await page.reload();
    await expect(page).toHaveURL(/\/th\?q=__persist_probe__/);
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pluto-shop-cart") ?? "{}"),
    );
    expect(Object.keys(persisted.state)).toEqual(["cartIds"]);
    expect(persisted.state.cartIds).toHaveLength(1);
    expect(persisted.state.cartIds.every(Number.isSafeInteger)).toBe(true);

    await page.getByRole("button", { name: "รถเข็น" }).click();
    await expect(page.getByRole("dialog", { name: "รถเข็น" }).locator("li")).toHaveCount(1);
  });

  test("uses 1, 2, and 4 result columns at target widths", async ({ page }) => {
    await page.goto("/en");
    await expectFullCatalog(page);

    for (const [width, columns] of [
      [375, 1],
      [768, 2],
      [1280, 4],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page
        .locator('section.product-grid[aria-label="Results"]')
        .evaluate((grid) => ({
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
      expect(layout.columns, `${width}px viewport`).toBe(columns);
      expect(layout.scrollWidth, `${width}px has no horizontal overflow`).toBe(
        layout.clientWidth,
      );
    }

    await page.setViewportSize({ width: 375, height: 820 });
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeHidden();
  });

  test("supports keyboard-only navigation and accessible control labels", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expectFullCatalog(page);

    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await tabUntil(page, 'input[type="search"]');
    await expect(page.getByRole("searchbox", { name: "Search assets" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Maximum price (THB)" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "In stock only" })).toBeVisible();
    await expect(page.locator(".cart-trigger")).toBeVisible();

    const detailButton = page.locator(".detail-button").first();
    await tabUntil(page, ".detail-button");
    await expect(detailButton).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add to cart" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Add to cart" }).click();
    await expect(dialog.getByRole("button", { name: "In cart" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(detailButton).toBeFocused();
  });
});
