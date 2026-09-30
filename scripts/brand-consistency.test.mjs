import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
// Public presentation only: do not scan migrations, historical plans, dependencies,
// runtime secrets, Java namespaces, npm names, or persisted storage identifiers.
const publicFiles = [
  "README.md",
  "docs/production-runbook.md",
  "apps/web/app/layout.tsx",
  "apps/web/app/[locale]/page.tsx",
  "apps/web/app/not-found.tsx",
  "apps/web/components/marketplace.tsx",
  "apps/web/e2e/marketplace.spec.ts",
  "apps/web/e2e/payment-responsive.spec.ts",
  "apps/web/tests/marketplace-query.test.tsx",
  "apps/web/tests/marketplace-dialogs.test.tsx",
  "apps/web/tests/payment-method-dialog.test.tsx",
  "infra/keycloak/realm-export.json",
  "infra/keycloak/themes/pluto/login/resources/css/pluto.css",
  "infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg",
  "infra/production/render-production-realm.mjs",
  "scripts/dev-compose.mjs",
  "infra/production/backup-production.sh",
  "infra/production/deploy-production.sh",
  "infra/production/healthcheck-production.sh",
  "infra/production/restore-check.sh",
  ...["backup", "health", "restore-check"].flatMap((job) =>
    ["service", "timer"].map((kind) => `infra/production/systemd/pluto-shop-${job}.${kind}`)),
  ...["cart/CartService", "payment/PromptPayPaymentService", "payment/TrueWalletPaymentService"]
    .map((service) => `apps/api/src/main/java/com/plutoshop/api/${service}.java`),
];

for (const relativePath of publicFiles) {
  test(`no stale public brand: ${relativePath}`, async () => {
    const content = await read(relativePath);
    // A checkout directory named PlutoShop is a technical path, not display copy.
    // Exempt only that exact path segment, never a whole line or code block.
    const presentation = relativePath.endsWith(".md")
      ? content.replace(/([/\\])PlutoShop(?=[/\\`\s]|$)/gu, "$1<checkout>")
      : content;
    assert.equal(/Pluto Shop|PlutoShop|Pluto API audience|Lost beyond Pluto/u.test(presentation), false, relativePath);
    // SITE_BRAND consumers must not duplicate the literal; rendered web tests own
    // positive UI expectations. Non-web positive checks are below.
  });
}

test("Keycloak public labels use the exact new brand", async () => {
  const realm = JSON.parse(await read("infra/keycloak/realm-export.json"));
  const client = realm.clients.find(({ clientId }) => clientId === "pluto-web");
  assert.equal(realm.displayName, "Phuto Shop");
  assert.equal(client.name, "Phuto Shop Web");
  assert.equal(client.protocolMappers.find(({ protocolMapper }) => protocolMapper === "oidc-audience-mapper").name, "Phuto Shop API audience");
  assert.match(await read("infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg"), /aria-label="Phuto Shop"/u);
});

test("development realm authentication contracts remain unchanged", async () => {
  const realm = JSON.parse(await read("infra/keycloak/realm-export.json"));
  assert.equal(realm.realm, "pluto");
  assert.equal(realm.loginTheme, "pluto");
  for (const flag of ["enabled", "registrationAllowed", "registrationEmailAsUsername", "loginWithEmailAllowed", "resetPasswordAllowed", "rememberMe"]) {
    assert.equal(realm[flag], true, flag);
  }
  assert.equal(realm.duplicateEmailsAllowed, false);
  assert.equal(realm.verifyEmail, false);
  assert.deepEqual(realm.roles.realm.map(({ name }) => name), ["CUSTOMER", "ADMIN"]);
  assert.equal(realm.clients.length, 1);
  const [client] = realm.clients;
  assert.equal(client.clientId, "pluto-web");
  assert.equal(client.protocol, "openid-connect");
  assert.equal(client.enabled, true);
  assert.equal(client.publicClient, true);
  assert.equal(client.standardFlowEnabled, true);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  const origins = ["http://keycloak.localhost:3000", "http://127.0.0.1:3000", "http://localhost:3000"];
  assert.deepEqual(client.webOrigins, origins);
  assert.deepEqual(client.redirectUris, origins.map((origin) => `${origin}/api/auth/callback`));
  assert.deepEqual(client.attributes, {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://127.0.0.1:3000/api/auth/logout/callback*##http://localhost:3000/api/auth/logout/callback*",
  });
  assert.deepEqual(client.protocolMappers.map(({ name, ...contract }) => contract), [
    {
      protocol: "openid-connect", protocolMapper: "oidc-usermodel-realm-role-mapper", consentRequired: false,
      config: { multivalued: "true", "userinfo.token.claim": "true", "id.token.claim": "true", "access.token.claim": "true", "claim.name": "realm_access.roles", "jsonType.label": "String" },
    },
    {
      protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", consentRequired: false,
      config: { "included.custom.audience": "pluto-api", "id.token.claim": "false", "access.token.claim": "true", "userinfo.token.claim": "false" },
    },
  ]);
});

test("production example SMTP display name uses Phuto Shop", async () => {
  const example = await read(".env.production.example");
  assert.equal(example.match(/^SMTP_FROM_DISPLAY_NAME=(.*)$/mu)?.[1], '"Phuto Shop"');
});
