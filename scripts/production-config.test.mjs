import test from "node:test";
import assert from "node:assert/strict";

const { buildProductionRealm } = await import("../infra/production/render-production-realm.mjs");

const validConfig = {
  shopDomain: "shop.example.com",
  authDomain: "auth.example.com",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpFrom: "no-reply@example.com",
  smtpFromDisplayName: "Pluto Shop",
  smtpUsername: "mailer",
  smtpPassword: "test-only-password",
};

test("production realm uses HTTPS origins and production email settings", () => {
  const realm = buildProductionRealm(validConfig);
  const client = realm.clients.find(({ clientId }) => clientId === "pluto-web");

  assert.equal(realm.verifyEmail, true);
  assert.equal(realm.sslRequired, "external");
  assert.equal(realm.attributes.frontendUrl, "https://auth.example.com/");
  assert.deepEqual(client.redirectUris, ["https://shop.example.com/api/auth/callback"]);
  assert.deepEqual(client.webOrigins, ["https://shop.example.com"]);
  assert.equal(client.attributes["post.logout.redirect.uris"], "https://shop.example.com/api/auth/logout/callback*");
  assert.equal(realm.smtpServer.host, "smtp.example.com");
  assert.equal(realm.smtpServer.port, "587");
  assert.equal(realm.smtpServer.starttls, "true");
});

test("production realm rejects non-HTTPS public origins", () => {
  assert.throws(
    () => buildProductionRealm({ ...validConfig, shopDomain: "http://shop.example.com" }),
    /SHOP_DOMAIN must be an HTTPS origin/,
  );
});
