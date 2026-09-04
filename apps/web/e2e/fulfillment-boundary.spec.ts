import { expect, test } from "@playwright/test";

test.describe("fulfillment authorization boundary", () => {
  test("anonymous admin fulfillment request stays behind the BFF", async ({ request }) => {
    const response = await request.get("/api/v1/admin/products/999999/fulfillment");
    const body = await response.text();

    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/problem+json");
    expect(body).not.toContain("ciphertext");
    expect(body).not.toContain("secretCiphertext");
  });

  test("anonymous customer reveal request is rejected without touching an order", async ({ request }) => {
    const response = await request.post("/api/v1/orders/999999/fulfillment/items/999999/reveal", {
      headers: { origin: "http://127.0.0.1:3000" },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/problem+json");
  });

  test("dynamic routes reject invalid identifiers", async ({ request }) => {
    const adminResponse = await request.get("/api/v1/admin/products/not-a-number/fulfillment");
    const customerResponse = await request.get("/api/v1/orders/not-a-number/fulfillment");

    expect(adminResponse.status()).toBe(400);
    expect(customerResponse.status()).toBe(400);
  });

  test("order page rejects an invalid identifier without redirecting to login", async ({ page }) => {
    const response = await page.goto("/th/orders/not-a-number");

    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText("synthetic-password");
  });
});
