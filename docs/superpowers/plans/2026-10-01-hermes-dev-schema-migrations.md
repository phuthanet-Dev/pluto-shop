# Hermes Dev Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Hermes add and remove Dev schema objects through tested Flyway migrations and the existing backup-gated Dev deployment, without running ad hoc DDL against the live database.

**Architecture:** Keep Flyway as the only schema-change path. Prove additive and expand-and-contract migrations against disposable PostgreSQL Testcontainers, then strengthen the existing deployment-order tests and agent instructions so backup verification precedes migrations and service replacement follows them.

**Tech Stack:** Flyway, PostgreSQL 18.6, Spring Boot 4.1.1, JUnit 5, Testcontainers, Node.js test suite.

**Spec:** `docs/superpowers/specs/2026-10-01-hermes-dev-capabilities-design.md`

## Global Constraints

- Apply Dev schema changes only through versioned Flyway migrations and `infra/dev/deploy.sh`.
- Run migration tests against disposable databases; do not add test columns to the live Dev database.
- Migrations must remain compatible with the currently deployed application during rollout.
- The existing encrypted pre-migration backup and restore-verification receipt must precede every live migration.
- A destructive or irreversible migration is reviewed by the owner before it is applied.
- Do not perform automatic database rollback, reset persistent volumes, fabricate payment success, or deploy Production.
- Use a `hermes/*` task branch; `codex/linux-dev-environment` is reserved for bootstrap work.
- Run this plan after `2026-10-01-hermes-runtime-access.md` and `2026-10-01-hermes-dev-database-access.md`; do not modify shared deployment files concurrently.

## Review Focus

- Additive changes must not break the previously deployed app; test `additiveMigrationKeepsLegacyColumnAvailable`.
- Removing a column too early could break the old app during rollout; test `contractMigrationRunsOnlyAfterExpandMigration`.
- Migration failure must leave current services and data intact; test `devDeployChecksBackupBeforeMigrationAndStartsServicesAfterMigration`.
- A developer might run DDL directly and drift from Flyway history; test `hermesInstructionsRequireVersionedMigrations` and the Testcontainers migration workflow.
- A test fixture might accidentally ship in the Dev image; test that migration fixtures stay under `src/test/resources` and never enter production migration resources.

---

### Task 1: Prove additive and destructive migration patterns on disposable PostgreSQL

**Files:**
- Create: `apps/api/src/test/java/com/plutoshop/api/dev/HermesSchemaMigrationIntegrationTest.java`
- Create: `apps/api/src/test/resources/db/migration/hermes-schema-test/V1__create_probe_table.sql`
- Create: `apps/api/src/test/resources/db/migration/hermes-schema-test/V2__add_new_column.sql`
- Create: `apps/api/src/test/resources/db/migration/hermes-schema-test/V3__drop_legacy_column.sql`
- Create: `apps/api/src/test/resources/db/migration/hermes-schema-test/V4__drop_probe_table.sql`

**Interfaces:**
- Test-only Flyway location: `classpath:db/migration/hermes-schema-test`.
- The test starts PostgreSQL through existing Testcontainers dependencies; the V1–V3 resources stay under `src/test/resources` and are never packaged into the Dev API image.

- [ ] **Step 1: Write failing migration workflow tests**

  Add `additiveMigrationKeepsLegacyColumnAvailable` to apply V1 and V2 and verify both old and new columns remain usable. Add `contractMigrationRunsOnlyAfterExpandMigration` to apply V3 and verify the legacy column is removed only after V2 has run and new-column data remains. Add `versionedMigrationsCanCreateAndDropTables` to verify V2 creates a second table and V4 removes it. Add `migrationFixturesStayOutOfRuntimeResources` to confirm the test-only Flyway location is outside `src/main/resources`.

- [ ] **Step 2: Run the focused test and confirm it fails**

  Run from `apps/api`: `mvn -B -ntp -Dtest=HermesSchemaMigrationIntegrationTest test`.

  Expected: FAIL because the test fixture and workflow test do not exist.

- [ ] **Step 3: Implement the test-only Flyway fixture**

  Create a probe table with a legacy column in V1; V2 adds a nullable replacement column and a second probe table; V3 drops only the legacy column after its replacement has been exercised; V4 drops the second probe table. Assert the schema and retained data after each migration. Do not add these files under `src/main/resources`.

- [ ] **Step 4: Run the focused test and full API verification**

  Run: `mvn -B -ntp -Dtest=HermesSchemaMigrationIntegrationTest test` and `mvn -B -ntp verify`.

  Expected: migration workflow tests and the existing API integration suite PASS against disposable containers; test-only migrations are absent from the runtime API artifact.

- [ ] **Step 5: Commit the migration fixtures and tests**

  ```bash
  git add apps/api/src/test/java/com/plutoshop/api/dev/HermesSchemaMigrationIntegrationTest.java apps/api/src/test/resources/db/migration/hermes-schema-test
  git commit -m "test: verify Dev schema migration workflow"
  ```

### Task 2: Guard the live migration sequence and document owner review

**Files:**
- Modify: `scripts/dev-server.test.mjs`
- Modify: `infra/dev/HERMES.md`
- Modify: `docs/dev-server-runbook.md`
- Read/verify: `infra/dev/deploy.sh`

**Interfaces:**
- Existing deployment stages remain the interface: clean allowed branch → web/API tests and image build → Dev Compose validation → matching encrypted backup receipt → `migrate` → service update → storefront health check.
- Hermes schema work creates migration files but calls only the existing `bash infra/dev/deploy.sh` entry point.

- [ ] **Step 1: Add failing deployment-order tests**

  Add `devDeployChecksBackupBeforeMigrationAndStartsServicesAfterMigration` to assert that backup receipt verification occurs before the `migrate` service and API/web replacement occurs after it. Add a negative assertion that `deploy.sh` contains no volume reset/removal or automatic database restore path. Add `hermesInstructionsRequireVersionedMigrations` and `hermesInstructionsRequireOwnerReviewForIrreversibleChanges` for the project instructions.

- [ ] **Step 2: Run the tests and confirm they fail**

  Run: `npm run test:dev-server`.

  Expected: FAIL because the new ordering/instruction assertions are not present.

- [ ] **Step 3: Strengthen only the tests and instructions**

  Keep the current deploy ordering if it satisfies the assertions. Document that Hermes writes all schema changes as Flyway migrations; additive changes must preserve the prior app version; destructive changes use expand-and-contract where practical and require owner review before live application. Keep failed migration handling manual and preserve newer orders.

- [ ] **Step 4: Run project and migration checks**

  Run `npm run test:dev-server`, `npm run test:root`, `npm run test:production-config`, `npm run lint`, `npm run typecheck`, and from `apps/api`, `mvn -B -ntp verify`.

  Expected: all checks PASS; the test-only fixtures are absent from the Dev API image; deployment-order and owner-review assertions pass.

- [ ] **Step 5: Commit the workflow checks and instructions**

  ```bash
  git add scripts/dev-server.test.mjs infra/dev/HERMES.md docs/dev-server-runbook.md
  git commit -m "docs: guard Hermes Dev schema changes"
  ```
