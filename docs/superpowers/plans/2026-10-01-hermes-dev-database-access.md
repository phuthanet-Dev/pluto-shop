# Hermes Dev Database Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner-requested Hermes agent read and perform DML on all application data tables in `plutoshop_dev` using a dedicated Dev-only database login.

**Architecture:** Keep PostgreSQL private on the internal Dev Compose network. Add an idempotent role bootstrap and a `psql` helper that connect as `hermes_dev_operator`; use a separately generated password and never pass database-owner credentials to ordinary SQL operations.

**Tech Stack:** PostgreSQL 18.6, Docker Compose, Bash, Python 3.11, Spring Boot 4.1.1, JUnit 5, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-01-hermes-dev-capabilities-design.md`

## Global Constraints

- Database scope: `plutoshop_dev` application-schema tables and sequences only; do not grant mutation or DDL privileges on `flyway_schema_history`, PostgreSQL system catalogs, or the Keycloak database.
- Hermes role name: `hermes_dev_operator`; grant `CONNECT`, schema `USAGE`, table `SELECT/INSERT/UPDATE/DELETE`, sequence use, and default privileges for future application objects.
- The role must not be a superuser, database owner, role administrator, or schema owner, and must not receive `CREATE`, `ALTER`, or `DROP`.
- Keep PostgreSQL on the internal `data` network; do not publish port 5432 or add a host-network path.
- Keep credentials in `.env.dev-server` with mode `0600`; never print them or commit them.
- Only Dev-specific Compose/bootstrap files may change; do not alter the Production Compose path or its runtime data.
- Use a `hermes/*` task branch; `codex/linux-dev-environment` is reserved for bootstrap work.
- Run this plan after `2026-10-01-hermes-runtime-access.md`; do not run database and runtime changes concurrently.

## Review Focus

- Existing `.env.dev-server` must gain one new credential without rotating existing keys; test `testAddsOnlyMissingHermesDatabasePassword` and `testPreservesExistingRuntimeCredentials`.
- Existing tables and future migration-created tables must both receive DML grants; test `operatorCanModifyExistingTables` and `operatorCanModifyFutureTables`.
- The operator must not mutate Flyway history or execute DDL; test `operatorCannotWriteMigrationHistory` and `operatorCannotCreateSchemaObjects`.
- PostgreSQL grants `CONNECT` to `PUBLIC` by default, including on `keycloak_dev`; test `operatorCannotConnectToKeycloakDatabase` and `keycloakServiceCanStillConnect` after revoking the inherited grant.
- Adding access must not expose PostgreSQL publicly; test `devPostgresHasNoPublishedPorts` and `roleBootstrapUsesInternalDataNetwork`.

---

### Task 1: Add and test the Dev-only database role bootstrap

**Files:**
- Create: `infra/dev/bootstrap-hermes-db-role.sh`
- Create: `infra/dev/hermes-db-role-bootstrap.sql`
- Create: `apps/api/src/test/java/com/plutoshop/api/dev/HermesDevDatabaseRoleIntegrationTest.java`

**Interfaces:**
- Bootstrap inputs: `POSTGRES_HOST` (default `postgres`), `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_OWNER_PASSWORD`, `POSTGRES_HERMES_PASSWORD`, `KEYCLOAK_DB_NAME`, and `KEYCLOAK_DB_USER`.
- Creates/updates login role `hermes_dev_operator`; the role password is supplied only through the private bootstrap environment and psql's environment-variable binding, never as a command-line argument.
- The SQL grants DML on application tables/sequences, configures default privileges for objects created by `POSTGRES_USER`, and revokes DML on `flyway_schema_history`.

- [ ] **Step 1: Write Testcontainers tests against the real bootstrap script**

  Add `operatorCanModifyExistingTables`, `operatorCanModifyFutureTables`, `operatorCannotWriteMigrationHistory`, `operatorCannotCreateSchemaObjects`, `operatorCannotConnectToKeycloakDatabase`, and `keycloakServiceCanStillConnect`. Run the exact shell/SQL bootstrap files in a disposable PostgreSQL container with fixture tables for `products`, `carts`, `payment_transactions`, `digital_inventory_items`, and `flyway_schema_history`; create a future table as the migration owner after bootstrap.

- [ ] **Step 2: Run the new integration tests and confirm they fail**

  Run from `apps/api`: `mvn -B -ntp -Dtest=HermesDevDatabaseRoleIntegrationTest test`.

  Expected: FAIL because the bootstrap and test class do not exist.

- [ ] **Step 3: Implement the idempotent SQL and shell bootstrap**

  Use safely quoted psql variables for identifiers and read passwords from the bootstrap process environment with psql `\getenv`, so secrets do not appear in process arguments. Set `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`; grant only the specified DML and sequence privileges. Revoke `CONNECT` and `TEMPORARY` from `PUBLIC` on `keycloak_dev`, explicitly preserve those privileges for the Keycloak service account, and revoke any direct Keycloak database grant from `hermes_dev_operator`. Do not grant DML on `flyway_schema_history` or DDL privileges.

- [ ] **Step 4: Run the focused Testcontainers suite**

  Run: `mvn -B -ntp -Dtest=HermesDevDatabaseRoleIntegrationTest test`.

  Expected: all six permission tests PASS, including the future-table, Keycloak-denial, and Keycloak-service connectivity cases.

- [ ] **Step 5: Commit the role bootstrap and integration tests**

  ```bash
  git add infra/dev/bootstrap-hermes-db-role.sh infra/dev/hermes-db-role-bootstrap.sql apps/api/src/test/java/com/plutoshop/api/dev/HermesDevDatabaseRoleIntegrationTest.java
  git commit -m "feat: add Hermes Dev database role"
  ```

### Task 2: Provision the credential and connect the role to Dev workflows

**Files:**
- Modify: `infra/dev/configure.py`
- Create: `infra/dev/ensure-hermes-db-password.py`
- Modify: `compose.dev-server.yaml`
- Modify: `infra/dev/deploy.sh`
- Create: `infra/dev/db.sh`
- Modify: `scripts/dev-server.test.mjs`
- Create: `infra/dev/test_hermes_db_password.py`

**Interfaces:**
- Runtime secret key: `POSTGRES_HERMES_PASSWORD`.
- Compose one-shot service: `hermes-db-role-bootstrap`, attached only to internal `data` network and run after migration but before application services start.
- CLI: `bash infra/dev/db.sh [psql options]`, fixed to database `plutoshop_dev` and role `hermes_dev_operator`; SQL input may be passed on stdin.

- [ ] **Step 1: Write failing tests for safe credential creation and Dev Compose wiring**

  Test that the existing environment file keeps every current value, an existing `POSTGRES_HERMES_PASSWORD` is not rotated, a missing key is generated once, the file remains mode `0600`, and stdout/stderr contain no secret. Extend `scripts/dev-server.test.mjs` with `devPostgresHasNoPublishedPorts`, `roleBootstrapUsesInternalDataNetwork`, and `roleBootstrapRunsAfterMigrationBeforeApplicationStart`.

- [ ] **Step 2: Run the focused tests and confirm they fail**

  Run: `python3 -m unittest discover -s infra/dev -p 'test_hermes_db_password.py' -v` and `npm run test:dev-server`.

  Expected: the new credential and Compose assertions fail before implementation.

- [ ] **Step 3: Add the one-time, non-rotating credential helper**

  Update `configure.py` to generate `POSTGRES_HERMES_PASSWORD` on new installations. Implement `ensure-hermes-db-password.py` for the existing installation: run as `hermes`, add only the missing key, write atomically, preserve all other values, set mode `0600`, and print only whether the credential is ready.

- [ ] **Step 4: Wire the one-shot service and client**

  Add `hermes-db-role-bootstrap` to `compose.dev-server.yaml`. Pass the owner password and Hermes role password only to that one-shot service, use the internal `data` network, `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, and no published ports. In `deploy.sh`, run the bootstrap after Flyway migration and before starting/updating Keycloak, API, and web. Implement `db.sh` to run `psql` inside the existing PostgreSQL container over TCP loopback with `POSTGRES_HERMES_PASSWORD`; do not print environment values or enable shell tracing. Confirm the operator receives privileges only on the application schema and that it lacks schema `CREATE` even if the cluster's default `PUBLIC` grant differs.

- [ ] **Step 5: Run focused and project checks**

  Run: `python3 -m unittest discover -s infra/dev -p 'test_hermes_db_password.py' -v`, `npm run test:dev-server`, `bash -n infra/dev/bootstrap-hermes-db-role.sh infra/dev/db.sh`, and from `apps/api`, `mvn -B -ntp -Dtest=HermesDevDatabaseRoleIntegrationTest test`.

  Expected: all tests PASS; Compose confirms PostgreSQL has no public port; no credential appears in output.

- [ ] **Step 6: Commit the Dev database access wiring**

  ```bash
  git add infra/dev/configure.py infra/dev/ensure-hermes-db-password.py infra/dev/test_hermes_db_password.py compose.dev-server.yaml infra/dev/deploy.sh infra/dev/db.sh scripts/dev-server.test.mjs
  git commit -m "feat: connect Hermes to Dev application data"
  ```

### Task 3: Enable and verify access on the live Dev database

**Files:**
- Modify: `infra/dev/HERMES.md`
- Modify: `docs/dev-server-runbook.md`

**Interfaces:**
- Consumes the role bootstrap and CLI from Tasks 1–2.
- Produces a live Dev connection check without exposing database contents or credentials in Telegram.

- [ ] **Step 1: Document the supported owner-requested DB workflow**

  Update `HERMES.md` with the fixed Dev database helper, broad row-level access, sensitive-data handling, Flyway-only DDL rule, and no Production fallback. Update the runbook with the one-time credential helper and live acceptance commands; do not include secret values.

- [ ] **Step 2: Run documentation and regression checks**

  Run `npm run test:dev-server`, Python credential tests, and `mvn -B -ntp -Dtest=HermesDevDatabaseRoleIntegrationTest test`.

  Expected: all tests PASS; the written commands use only the Dev database path.

- [ ] **Step 3: Provision and verify on Dev**

  Run the credential helper as Hermes without sudo, then run the normal checked Dev deployment so it creates the role after the encrypted backup/migration gate. From the owner-allowlisted Telegram session, run `printf 'SELECT current_user, current_database();\n' | bash infra/dev/db.sh`; verify DML privileges against the disposable Testcontainers database rather than changing real orders or payments for acceptance.

  Expected: Dev connection succeeds; Keycloak and Production remain inaccessible through the dedicated SQL role; PostgreSQL remains unexposed publicly.

- [ ] **Step 4: Commit the operator instructions**

  ```bash
  git add infra/dev/HERMES.md docs/dev-server-runbook.md
  git commit -m "docs: explain Hermes Dev database access"
  ```
