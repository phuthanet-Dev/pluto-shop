import { expect, test } from "@playwright/test";

const productResponse = {
  items: [{
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
  }],
  total: 1,
  priceRange: { minMinor: 1098, maxMinor: 1098, currency: "THB" },
};

const cartResponse = {
  items: [{ productId: 1, quantity: 1 }],
  removedProductIds: [],
  version: 1,
};

function checkoutResponse() {
  return {
    orderId: 17,
    transactionId: "responsive-payment",
    amountMinor: 1098,
    currency: "THB",
    qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=270x270&data=responsive",
    payload: "000201010212",
    expiresAt: "2099-08-29T02:00:00Z",
    status: "PENDING",
  };
}

test("keeps the PromptPay dialog themed and contained across device widths", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      user: {
        sub: "responsive-user",
        email: "responsive@example.invalid",
        name: "Responsive User",
        roles: ["CUSTOMER"],
      },
    }),
  }));
  await page.route("**/api/v1/products**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(productResponse),
  }));
  await page.route("**/api/v1/cart**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(cartResponse),
  }));
  await page.route("**/api/v1/checkout/promptpay", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(checkoutResponse()),
  }));

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 360, height: 800 },
    { width: 430, height: 900 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/en", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Cart" }).click();
    await page.getByRole("dialog", { name: "Cart" }).getByRole("button", { name: "Choose payment method" }).click();
    const chooser = page.getByText("Choose a payment method").locator("xpath=ancestor::*[@role='dialog'][1]");
    await chooser.getByRole("button", { name: "Pay with PromptPay" }).click();

    const dialog = page.getByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: "PromptPay QR code" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Check payment" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel payment" })).toBeVisible();

    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector<HTMLElement>(".payment-dialog-body");
      if (!body) throw new Error("Missing payment dialog body");
      const bodyStyle = getComputedStyle(body);
      const style = getComputedStyle(element);
      return {
        rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        backgroundColor: style.backgroundColor,
        color: style.color,
        bodyColumns: bodyStyle.gridTemplateColumns.trim().split(/\s+/u).length,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });

    expect(layout.backgroundColor).toBe("rgb(13, 13, 18)");
    expect(layout.color).toBe("rgb(244, 242, 247)");
    expect(layout.rect.x).toBeGreaterThanOrEqual(0);
    expect(layout.rect.y).toBeGreaterThanOrEqual(0);
    expect(layout.rect.right).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.rect.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.bodyColumns).toBe(viewport.width < 760 ? 1 : 2);

    await dialog.getByRole("button", { name: "Close payment" }).click();
  }
});
