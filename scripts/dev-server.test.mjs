import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    POSTGRES_DB: "plutoshop_dev", KEYCLOAK_DB_NAME: "keycloak_dev", POSTGRES_HERMES_PASSWORD: "fixture-only",
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

test("Dev PostgreSQL and Hermes DB bootstrap remain private to the data network", (t) => {
  const available = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (available.error?.code === "ENOENT") return t.skip("Docker CLI unavailable; run on the deployment host");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|HOME|USERPROFILE|TEMP|TMP|DOCKER_CONFIG|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(key)));
  Object.assign(env, {
    SHOP_DOMAIN: "dev.phutoshop.com", AUTH_DOMAIN: "auth-dev.phutoshop.com",
    IMAGE_NAMESPACE: "pluto-dev", IMAGE_TAG: "a".repeat(40),
    KEYCLOAK_REALM_FILE: "./infra/dev/runtime/realm-dev.json",
    POSTGRES_DB: "plutoshop_dev", POSTGRES_USER: "pluto",
    KEYCLOAK_DB_NAME: "keycloak_dev", POSTGRES_HERMES_PASSWORD: "fixture-only",
  });
  const result = spawnSync("docker", ["compose", "--env-file", ".env.production.example", "-f", "compose.dev-server.yaml", "config", "--format", "json"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  const postgres = config.services.postgres;
  const bootstrap = config.services["hermes-db-role-bootstrap"];

  assert.equal(postgres.ports, undefined);
  assert.deepEqual(Object.keys(postgres.networks), ["data"]);
  assert.equal(config.networks.data.internal, true);
  assert.ok(bootstrap);
  assert.equal(bootstrap.ports, undefined);
  assert.deepEqual(Object.keys(bootstrap.networks), ["data"]);
  assert.equal(bootstrap.read_only, true);
  assert.deepEqual(bootstrap.cap_drop, ["ALL"]);
  assert.ok(bootstrap.security_opt.includes("no-new-privileges:true"));
  assert.ok(bootstrap.environment.POSTGRES_OWNER_PASSWORD);
  assert.ok(bootstrap.environment.POSTGRES_HERMES_PASSWORD);
});

test("Hermes role bootstrap runs after backup-gated migrations and before app services", () => {
  const deploy = readFileSync("infra/dev/deploy.sh", "utf8");
  const deployLock = deploy.indexOf("flock -n 9");
  const credentialSetup = deploy.indexOf("ensure-hermes-db-password.py");
  const backupGate = deploy.indexOf("Waiting for administrator-owned encrypted off-host backup");
  const migration = deploy.indexOf("run --rm migrate");
  const operatorBootstrap = deploy.indexOf("run --rm hermes-db-role-bootstrap");
  const keycloak = deploy.indexOf("up -d --no-deps --wait --wait-timeout 300 keycloak");
  const apiWeb = deploy.indexOf("up -d --no-deps --wait --wait-timeout 180 api web");

  assert.ok(deployLock >= 0 && deployLock < credentialSetup);
  assert.ok(backupGate >= 0 && backupGate < migration);
  assert.ok(migration < operatorBootstrap);
  assert.ok(operatorBootstrap < keycloak);
  assert.ok(operatorBootstrap < apiWeb);
});

test("Hermes DB grants stop at application DML and deny schema and Flyway writes", () => {
  const sql = readFileSync("infra/dev/hermes-db-role-bootstrap.sql", "utf8");

  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hermes_dev_operator/i);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.flyway_schema_history FROM hermes_dev_operator/i);
  assert.doesNotMatch(sql, /GRANT\s+CREATE\s+ON\s+SCHEMA\s+public\s+TO\s+hermes_dev_operator/i);
  assert.match(sql, /NOSUPERUSER NOCREATEDB NOCREATEROLE/i);
  assert.doesNotMatch(sql, /GRANT\s+ALL\s+ON\s+SCHEMA\s+public\s+TO\s+hermes_dev_operator/i);
});
test("Hermes database CLI fixes the database identity and uses the operator password", () => {
  const database = readFileSync("infra/dev/db.sh", "utf8");

  assert.match(database, /POSTGRES_DB" == plutoshop_dev/);
  assert.match(database, /export PGPASSWORD="\$POSTGRES_HERMES_PASSWORD"/);
  assert.match(database, /--env PGPASSWORD postgres/);
  assert.match(database, /--username hermes_dev_operator --dbname plutoshop_dev/);
  assert.match(database, /The database host, user, and database are fixed/);
  assert.doesNotMatch(database, /POSTGRES_OWNER_PASSWORD|POSTGRES_PASSWORD/);
});
test("Hermes instructions keep data and schema work on the guarded Dev path", () => {
  const instructions = readFileSync("infra/dev/HERMES.md", "utf8");
  const runbook = readFileSync("docs/dev-server-runbook.md", "utf8");

  assert.match(instructions, /bash infra\/dev\/db\.sh/);
  assert.match(instructions, /versioned Flyway migrations/);
  assert.match(instructions, /owner review/);
  assert.match(runbook, /SELECT current_user, current_database\(\)/);
  assert.match(runbook, /hermes_dev_operator/);
  assert.match(runbook, /matching encrypted backup receipt/);
  assert.match(runbook, /active gateway process's mount namespace/);
  assert.doesNotMatch(runbook, /POSTGRES_HERMES_PASSWORD=['"][^'"\r\n]+['"]/);
});
test("Hermes schema migration fixtures stay in test resources", () => {
  const testResources = "apps/api/src/test/resources/db/migration/hermes-schema-test";
  const runtimeResources = "apps/api/src/main/resources/db/migration/hermes-schema-test";

  assert.ok(existsSync(testResources + "/V1__create_probe_table.sql"));
  assert.ok(existsSync(testResources + "/V2__expand_probe_table.sql"));
  assert.ok(existsSync(testResources + "/V3__contract_probe_table.sql"));
  assert.ok(existsSync(testResources + "/V4__drop_related_probe_table.sql"));
  assert.equal(existsSync(runtimeResources), false);
});
test("Dev deployment gates migration before replacing application services", () => {
  const deploy = readFileSync("infra/dev/deploy.sh", "utf8");
  const backupWait = deploy.indexOf("Waiting for administrator-owned encrypted off-host backup");
  const migration = deploy.indexOf("run --rm migrate");
  const operatorBootstrap = deploy.indexOf("run --rm hermes-db-role-bootstrap");
  const keycloak = deploy.indexOf("up -d --no-deps --wait --wait-timeout 300 keycloak");
  const apiWeb = deploy.indexOf("up -d --no-deps --wait --wait-timeout 180 api web");
  const healthCheck = deploy.indexOf("curl -fsS --max-time 20 http://127.0.0.1:13000/th");

  assert.ok(backupWait >= 0 && backupWait < migration);
  assert.ok(migration < operatorBootstrap && operatorBootstrap < keycloak);
  assert.ok(keycloak < apiWeb && apiWeb < healthCheck);
  assert.doesNotMatch(deploy, /down\s+-v|docker\s+volume\s+(?:rm|prune)|dropdb|pg_restore/i);
});

test("Hermes instructions require reviewed migrations for irreversible schema changes", () => {
  const instructions = readFileSync("infra/dev/HERMES.md", "utf8");

  assert.match(instructions, /versioned Flyway migrations/);
  assert.match(instructions, /irreversible or data-removing migration requires owner review/);
  assert.match(instructions, /Do not run DDL directly through db\.sh/);
  const runbook = readFileSync("docs/dev-server-runbook.md", "utf8");
  assert.match(runbook, /expand-and-contract/);
  assert.match(runbook, /src\/test\/resources\/db\/migration/);
});
test("API Testcontainers receive only the Dev database bootstrap source files", () => {
  const deploy = readFileSync("infra/dev/deploy.sh", "utf8");
  const apiTests = deploy.slice(
    deploy.indexOf("# API integration tests"),
    deploy.indexOf("docker build -t"),
  );

  assert.ok(apiTests.includes("src=$ROOT_DIR/infra/dev/bootstrap-hermes-db-role.sh,dst=/tmp/bootstrap-hermes-db-role.sh,readonly"));
  assert.ok(apiTests.includes("src=$ROOT_DIR/infra/dev/hermes-db-role-bootstrap.sql,dst=/tmp/hermes-db-role-bootstrap.sql,readonly"));
  assert.doesNotMatch(apiTests, /src=\$ROOT_DIR\/infra\/dev,dst=/);
});

test("Dev deployment runs Hermes Python unit tests before building images", () => {
  const deploy = readFileSync("infra/dev/deploy.sh", "utf8");
  const pythonTests = deploy.indexOf(
    "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s infra/dev -p 'test_hermes_*.py'",
  );
  const buildTests = deploy.indexOf("# Build/test before touching running services.");

  assert.ok(pythonTests >= 0 && pythonTests < buildTests);
});
