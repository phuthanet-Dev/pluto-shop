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
    imageUrl: null,
  }, {
    id: 2,
    slug: "nebula-glyphs",
    nameTh: "ชุดไอคอนเนบิวลา",
    nameEn: "Nebula Glyph Set",
    descriptionTh: "ไอคอนเนบิวลาสำหรับงานสร้างสรรค์",
    descriptionEn: "Nebula icons for creative work",
    visualCode: "NEBULA-02",
    type: "SINGLE",
    selectionMode: "SINGLE_OPTION",
    optionGroup: null,
    optionLabelTh: null,
    optionLabelEn: null,
    priceMinor: 149900,
    currency: "THB",
    stockQuantity: 6,
    bundleItemCount: null,
    instantDelivery: true,
    catalogOrder: 2,
    imageUrl: null,
  }],
  total: 2,
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
  await page.route("**/api/v1/payments/promptpay/responsive-payment/cancel", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      orderId: 17,
      transactionId: "responsive-payment",
      amountMinor: 1098,
      currency: "THB",
      expiresAt: "2099-08-29T02:00:00Z",
      status: "CANCELLED",
      message: "Payment cancelled",
    }),
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
    await expect(chooser.getByTestId("promptpay-logo").locator("img")).toBeVisible();
    await expect(chooser.getByTestId("truemoney-logo").locator("img")).toBeVisible();
    await expect(chooser.getByTestId("promptpay-logo").locator("img")).toHaveAttribute("src", /\/icons\/promptpay-logo\.svg(?:\?.*)?$/u);
    await expect(chooser.getByTestId("truemoney-logo").locator("img")).toHaveAttribute("src", /\/icons\/truemoney-wallet\.svg(?:\?.*)?$/u);
    await expect(chooser.getByText("Select how you want to pay for this order.")).toHaveCount(0);
    await chooser.getByRole("button", { name: "Refund steps" }).click();
    const refundDialog = page.getByRole("dialog", { name: "Refund request steps" });
    await expect(refundDialog).toBeVisible();
    await expect(refundDialog.getByRole("listitem")).toHaveCount(3);
    const refundLayout = await refundDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    expect(refundLayout.rect.x).toBeGreaterThanOrEqual(0);
    expect(refundLayout.rect.y).toBeGreaterThanOrEqual(0);
    expect(refundLayout.rect.right).toBeLessThanOrEqual(refundLayout.viewport.width + 1);
    expect(refundLayout.rect.bottom).toBeLessThanOrEqual(refundLayout.viewport.height + 1);
    expect(refundLayout.scrollWidth).toBeLessThanOrEqual(refundLayout.clientWidth);
    await refundDialog.getByRole("button", { name: "Understood" }).click();
    await expect(refundDialog).not.toBeVisible();
    for (const logoId of ["promptpay-logo", "truemoney-logo"]) {
      const centered = await chooser.getByTestId(logoId).evaluate((element) => {
        const frame = element.getBoundingClientRect();
        const image = element.querySelector("img")?.getBoundingClientRect();
        if (!image) throw new Error("Missing logo image");
        return Math.abs((frame.left + frame.width / 2) - (image.left + image.width / 2));
      });
      expect(centered).toBeLessThanOrEqual(1);
    }
    await chooser.getByRole("button", { name: "Pay with PromptPay" }).click();

    const dialog = page.getByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img.payment-payee-logo")).toHaveAttribute("src", /favicon\.svg/u);
    const qrCode = dialog.getByRole("img", { name: "PromptPay QR code" });
    await expect(qrCode).toBeVisible();
    await expect(qrCode).not.toHaveClass("payment-qr-image-blurred");
    const accountCard = dialog.getByRole("region", { name: "PromptPay account verification" });
    await expect(accountCard).toBeVisible();
    await expect(accountCard.getByText("ภูธเนศ สง่าชาติ")).toBeVisible();
    await expect(accountCard.getByText("0842191195")).toBeVisible();
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
    expect(layout.bodyColumns).toBe(viewport.width < 760 ? 1 : 2);
    const accountLayout = await accountCard.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    expect(accountLayout.scrollWidth).toBeLessThanOrEqual(accountLayout.clientWidth);
    expect(accountLayout.rect.right).toBeLessThanOrEqual(layout.viewport.width + 1);

    await dialog.getByRole("button", { name: "Close payment" }).click();
    await page.getByRole("button", { name: "View details for Nebula Glyph Set" }).click();
    const lockedProductDialog = page.getByRole("dialog", { name: "Nebula Glyph Set" });
    await expect(lockedProductDialog.getByRole("button", { name: "Add to cart" })).toBeDisabled();
    await expect(lockedProductDialog.getByText("This cart is locked while the current QR payment is pending. Cancel the payment before editing your cart.")).toBeVisible();
    await lockedProductDialog.getByRole("button", { name: "Close details" }).click();
    await page.getByRole("button", { name: "Cart" }).click();
    const lockedDrawer = page.getByRole("dialog", { name: "Cart" });
    await expect(lockedDrawer).toBeVisible();
    await expect(lockedDrawer.getByText("This cart is locked while the current QR payment is pending. Cancel the payment before editing your cart.")).toBeVisible();
    await expect(lockedDrawer.getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).toBeDisabled();
    await expect(lockedDrawer.getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).toBeDisabled();
    await lockedDrawer.getByRole("button", { name: "Continue payment" }).click();

    const resumedDialog = page.getByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    await expect(resumedDialog).toBeVisible();
    await resumedDialog.getByRole("button", { name: "Cancel payment" }).click();
    const confirmation = page.getByRole("dialog", { name: "Cancel payment?" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveAttribute("data-tone", "danger");
    await expect(confirmation.getByRole("button", { name: "Keep payment" })).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Confirm cancellation" })).toBeVisible();

    const confirmationLayout = await confirmation.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    expect(confirmationLayout.rect.x).toBeGreaterThanOrEqual(0);
    expect(confirmationLayout.rect.y).toBeGreaterThanOrEqual(0);
    expect(confirmationLayout.rect.right).toBeLessThanOrEqual(confirmationLayout.viewport.width + 1);
    expect(confirmationLayout.rect.bottom).toBeLessThanOrEqual(confirmationLayout.viewport.height + 1);
    expect(confirmationLayout.scrollWidth).toBeLessThanOrEqual(confirmationLayout.clientWidth);
    expect(confirmationLayout.scrollHeight).toBeLessThanOrEqual(confirmationLayout.clientHeight);

    await confirmation.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(resumedDialog).toContainText("Payment cancelled");
    const cancelledQr = resumedDialog.getByRole("img", { name: "PromptPay QR code unavailable because the payment was cancelled" });
    await expect(cancelledQr).toHaveClass(/\bpayment-qr-image-blurred\b/u);
    await expect(resumedDialog.locator(".payment-state-card p")).toHaveCount(0);
    await expect(resumedDialog.getByText("Payment cancelled", { exact: true })).toHaveCount(1);
    await resumedDialog.getByRole("button", { name: "Close payment window" }).click();
    await page.getByRole("button", { name: "Cart" }).click();
    const unlockedDrawer = page.getByRole("dialog", { name: "Cart" });
    await expect(unlockedDrawer.getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).toBeEnabled();
    await expect(unlockedDrawer.getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).toBeEnabled();
  }
});
