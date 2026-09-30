import { expect, test } from "@playwright/test";

for (const locale of ["th", "en"]) {
  for (const width of [390, 1440]) {
    test(`brands ${locale} at ${width}px without changing navigation`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: false } }));
      await page.route("**/api/v1/products**", route => route.fulfill({ json: {
        items: [], total: 0, priceRange: { minMinor: 0, maxMinor: 0, currency: "THB" },
      } }));
      await page.goto(`/${locale}`);
      await expect(page).toHaveTitle("Phuto Shop");
      await expect(page.getByRole("link", { name: "Phuto Shop home" })).toHaveAttribute("href", `/${locale}`);
      await expect(page.locator(".footer-brand")).toHaveText("Phuto Shop");
      await expect(page.locator(".hero-kicker")).toContainText("Phuto Shop");
      await expect(page.locator(".hero-kicker")).toHaveCSS("text-transform", "none");
      await expect(page.locator(".breadcrumb span").first()).toHaveCSS("text-transform", "none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/brand-${locale}-${width}.png`, fullPage: true });
    });
  }
}

test("404 retains the Thai return route", async ({ page }) => {
  const response = await page.goto("/not-a-real-route");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Lost beyond the catalog" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to Phuto Shop" })).toHaveAttribute("href", "/th");
});
