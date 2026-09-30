import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { buildProductionRealm, renderProductionRealm } = await import("../infra/production/render-production-realm.mjs");

const validConfig = {
  shopDomain: "shop.example.com",
  authDomain: "auth.example.com",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpFrom: "no-reply@example.com",
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

test("production realm defaults the omitted SMTP display name to Phuto Shop", () => {
  assert.equal(buildProductionRealm(validConfig).smtpServer.fromDisplayName, "Phuto Shop");
});

test("production realm preserves an explicit SMTP display name override", () => {
  assert.equal(buildProductionRealm({ ...validConfig, smtpFromDisplayName: "Store Support" }).smtpServer.fromDisplayName, "Store Support");
});

test("production realm preserves realm, client, audience and PKCE contracts", () => {
  const realm = buildProductionRealm(validConfig);
  assert.equal(realm.realm, "pluto");
  assert.equal(realm.loginTheme, "pluto");
  assert.equal(realm.displayName, "Phuto Shop");
  assert.equal(realm.clients.length, 1);
  const [client] = realm.clients;
  assert.equal(client.clientId, "pluto-web");
  assert.equal(client.name, "Phuto Shop Web");
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  const audience = client.protocolMappers.find(({ protocolMapper }) => protocolMapper === "oidc-audience-mapper");
  assert.deepEqual(audience.config, {
    "included.custom.audience": "pluto-api", "id.token.claim": "false",
    "access.token.claim": "true", "userinfo.token.claim": "false",
  });
});

for (const override of [undefined, "Store Support"]) {
  test(`rendered file uses ${override === undefined ? "the omitted display-name default" : "an explicit display-name override"}`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "brand-realm-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    // Explicit synthetic env: never read the developer's real environment or secrets.
    const env = {
      SHOP_DOMAIN: validConfig.shopDomain, AUTH_DOMAIN: validConfig.authDomain,
      SMTP_HOST: validConfig.smtpHost, SMTP_FROM: validConfig.smtpFrom,
      SMTP_USERNAME: validConfig.smtpUsername, SMTP_PASSWORD: validConfig.smtpPassword,
      ...(override === undefined ? {} : { SMTP_FROM_DISPLAY_NAME: override }),
    };
    const outputPath = path.join(directory, "realm.json");
    assert.equal(await renderProductionRealm({ env, outputPath }), outputPath);
    const realm = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(realm.smtpServer.fromDisplayName, override ?? "Phuto Shop");
    assert.equal(realm.realm, "pluto");
    assert.equal(realm.clients[0].clientId, "pluto-web");
  });
}

test("production realm rejects non-HTTPS public origins", () => {
  assert.throws(
    () => buildProductionRealm({ ...validConfig, shopDomain: "http://shop.example.com" }),
    /SHOP_DOMAIN must be an HTTPS origin/,
  );
});
