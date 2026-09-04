import { expect, test } from "@playwright/test";

const product = {
  id: 1,
  slug: "pluto-glyphs",
  nameTh: "ชุดไอคอนพลูโต",
  nameEn: "Pluto Glyph Set",
  descriptionTh: "ไอคอนสำหรับงานสร้างสรรค์",
  descriptionEn: "Icons for creative work",
  visualCode: "PLUTO-01",
  type: "SINGLE",
  selectionMode: "SINGLE_OPTION",
  optionGroup: null,
  optionLabelTh: null,
  optionLabelEn: null,
  priceMinor: 1098,
  currency: "THB",
  stockQuantity: 8,
  bundleItemCount: null,
  instantDelivery: true,
  catalogOrder: 1,
  imageUrl: null,
};

test("offers a fresh login when checkout returns 401", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      user: { sub: "session-expired-user", email: "session@example.invalid", name: "Session User", roles: ["CUSTOMER"] },
    }),
  }));
  await page.route("**/api/v1/products**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [product], total: 1, priceRange: { minMinor: 1098, maxMinor: 1098, currency: "THB" } }),
  }));
  await page.route("**/api/v1/cart**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }),
  }));
  await page.route("**/api/v1/checkout/promptpay", (route) => route.fulfill({
    status: 401,
    contentType: "application/problem+json",
    body: JSON.stringify({ type: "about:blank", title: "Unauthorized", status: 401 }),
  }));

  await page.goto("/en", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Cart" }).click();
  const cart = page.getByRole("dialog", { name: "Cart" });
  await cart.getByRole("button", { name: "Choose payment method" }).click();
  const chooser = page.getByText("Choose a payment method").locator("xpath=ancestor::*[@role='dialog'][1]");
  await chooser.getByRole("button", { name: "Pay with PromptPay" }).click();

  await expect(chooser.getByRole("alert")).toContainText("Your payment session expired. Please log in again.");
  const reloginLink = chooser.getByRole("link", { name: "Log in" });
  await expect(reloginLink).toHaveAttribute(
    "href",
    "/api/auth/login?callbackUrl=%2Fen",
  );
  await expect(reloginLink).toHaveCSS("text-decoration-line", "underline");
});
