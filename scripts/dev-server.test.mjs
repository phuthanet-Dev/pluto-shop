import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildProductionRealm } from "../infra/production/render-production-realm.mjs";

test("dev realm uses separate HTTPS origins without weakening email verification", () => {
  const realm = buildProductionRealm({
    shopDomain: "dev.phutoshop.com", authDomain: "auth-dev.phutoshop.com",
    smtpHost: "smtp.example.com", smtpFrom: "dev@example.com", smtpUsername: "dev", smtpPassword: "fixture",
  });
  assert.equal(realm.verifyEmail, true);
  const client = realm.clients.find((item) => item.clientId === "pluto-web");
  assert.deepEqual(client.redirectUris, ["https://dev.phutoshop.com/api/auth/callback"]);
  assert.deepEqual(client.webOrigins, ["https://dev.phutoshop.com"]);
  assert.equal(realm.attributes.frontendUrl, "https://auth-dev.phutoshop.com/");
});

test("rendered dev Compose isolates data and publishes only loopback web/auth", (t) => {
  const available = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (available.error?.code === "ENOENT") return t.skip("Docker CLI unavailable; run on the deployment host");
  assert.equal(available.status, 0, available.stderr);
  // Do not allow developer secrets or a real .env to enter the rendered fixture.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|HOME|USERPROFILE|TEMP|TMP|DOCKER_CONFIG|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(key)));
  Object.assign(env, {
    SHOP_DOMAIN: "dev.phutoshop.com", AUTH_DOMAIN: "auth-dev.phutoshop.com",
    IMAGE_NAMESPACE: "pluto-dev", IMAGE_TAG: "a".repeat(40),
    KEYCLOAK_REALM_FILE: "./infra/dev/runtime/realm-dev.json",
    POSTGRES_DB: "plutoshop_dev", KEYCLOAK_DB_NAME: "keycloak_dev",
  });
  const result = spawnSync("docker", ["compose", "--env-file", ".env.production.example", "-f", "compose.dev-server.yaml", "config", "--format", "json"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.name, "pluto-shop-dev");
  assert.equal(config.services.caddy, undefined);
  for (const [name, service] of Object.entries(config.services)) {
    for (const port of service.ports ?? []) {
      assert.ok(["web", "keycloak"].includes(name));
      assert.equal(port.host_ip, "127.0.0.1");
    }
  }
  assert.equal(config.services.web.ports[0].published, "13000");
  assert.equal(config.services.keycloak.ports[0].published, "18081");
  assert.equal(config.services.web.environment.DEPLOYMENT_ENV, "dev");
  assert.equal(config.services.web.environment.OIDC_REDIRECT_URI, "https://dev.phutoshop.com/api/auth/callback");
  assert.equal(config.services.api.environment.SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI, "https://auth-dev.phutoshop.com/realms/pluto");
  assert.equal(config.networks.data.internal, true);
  for (const volume of Object.values(config.volumes)) assert.ok(volume.name.startsWith("pluto-shop-dev_"));
  assert.equal(config.services.api.environment.INWCLOUD_TRUEWALLET_ENABLED, "false");
});

test("testSystemdDropInPreservesProductionIsolation", () => {
  const unit = readFileSync("infra/dev/admin-start-dev.sh", "utf8");

  assert.match(unit, /InaccessiblePaths=.*\/var\/run\/docker\.sock/);
  assert.match(unit, /InaccessiblePaths=.*\/opt\/pluto-shop/);
  assert.match(unit, /InaccessiblePaths=.*\/etc\/pluto-dev-backup\.env/);
  assert.doesNotMatch(unit, /usermod\s+-aG\s+docker/);
});

test("testKeepsTelegramOwnerAllowlistEnabled", () => {
  const configure = readFileSync("infra/dev/configure-hermes.py", "utf8");
  const repair = readFileSync("infra/dev/admin-fix-gateway.sh", "utf8");

  assert.match(configure, /values\.get\('TELEGRAM_ALLOWED_USERS'/);
  assert.match(configure, /GATEWAY_ALLOW_ALL_USERS': 'false'/);
  assert.match(configure, /TELEGRAM_ALLOW_ALL_USERS': 'false'/);
  assert.match(configure, /Existing Telegram token and single-owner allowlist preserved/);
  assert.match(repair, /original owner allowlist/);
});

test("testPythonUnitBytecodeDoesNotDirtyDevDeployTree", () => {
  const ignoreRules = readFileSync(".gitignore", "utf8");

  assert.match(ignoreRules, /^__pycache__\/$/m);
  assert.match(ignoreRules, /^\*\.py\[cod\]$/m);
});
