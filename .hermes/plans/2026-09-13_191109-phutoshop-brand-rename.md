# phutoshop Brand Rename Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, with a spec-compliance review and code-quality review after each logical task.

**Goal:** Rename the customer-facing website brand from `Pluto Shop`/`PlutoShop` to the exact public name `phutoshop` across the web UI, metadata, authentication presentation, documentation, operational messages, and tests without breaking authentication, persisted carts, databases, deployments, or cryptographic compatibility.

**Architecture:** Add one canonical frontend brand constant at `apps/web/lib/brand.ts` and make web metadata, accessible labels, payment-dialog labels, header/footer copy, and error pages consume it. Update public-facing Keycloak, production-renderer, documentation, and operational copy separately from migration-sensitive technical identifiers. Treat package scopes, Java namespaces, database names, OIDC identifiers, Docker volumes, browser storage keys, and protocol-format strings as a separate migration track rather than blindly replacing every `pluto` token.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Vitest / Playwright; Spring Boot 4 / Java 17 / Maven Wrapper; Docker Compose; Keycloak; Node built-in test runner.

---

## Current context / assumptions

- Repository: `D:/workspace/Person/PlutoShop`.
- The repository is already dirty with unrelated frontend, payment, API, Compose, and test changes. Do not reset, stash, overwrite, or commit those changes accidentally. Before every commit, review `git diff -- <path>` and stage only the rename hunks.
- The requested public spelling is assumed to be exactly lowercase `phutoshop`. If the desired display casing is `PhutoShop`, change the canonical constant once before implementation.
- Current public-brand occurrences include:
  - `apps/web/app/layout.tsx`
  - `apps/web/app/[locale]/page.tsx`
  - `apps/web/app/not-found.tsx`
  - `apps/web/components/marketplace.tsx`
  - `apps/web/e2e/marketplace.spec.ts`
  - `apps/web/e2e/payment-responsive.spec.ts`
  - `apps/web/tests/marketplace-query.test.tsx`
  - `apps/web/tests/marketplace-dialogs.test.tsx`
  - `apps/web/tests/payment-method-dialog.test.tsx`
  - `infra/keycloak/realm-export.json`
  - `infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg`
  - `infra/keycloak/themes/pluto/login/resources/css/pluto.css`
  - `infra/production/render-production-realm.mjs`
  - `scripts/production-config.test.mjs`
  - `README.md`, `docs/production-runbook.md`, and operational scripts.
- The following identifiers are contracts, not merely branding:
  - Java package namespace `com.plutoshop` and API Maven coordinates in `apps/api/pom.xml`.
  - Root/web npm names `pluto-shop` and `@pluto-shop/web` in `package.json`, `apps/web/package.json`, and `package-lock.json`.
  - PostgreSQL database/role/storage values such as `plutoshop`, `pluto_app`, and `/var/lib/plutoshop/product-media`.
  - Keycloak realm/client/audience values `pluto`, `pluto-web`, and `pluto-api`.
  - Guest cart localStorage key `pluto-shop-cart` in `apps/web/stores/cart.ts`.
  - Fulfillment protocol context string `plutoshop-fulfillment-v1` in the API.
  - Compose project/service/image/volume names and production systemd unit names.
- Default scope below changes public identity while preserving those contracts. The optional technical-rebrand phase describes the additional migrations if “ทั้งโปรเจ็ค” means every internal identifier too.

## Architecture / proposed approach

Use a two-layer rename: public presentation first, then an explicit compatibility-reviewed technical migration only where requested. Keep the public name DRY in the web layer, update generated/public auth copy from the same source where practical, and add a small repository test that prevents old public names from returning. Do not change authentication issuers, database/storage names, cryptographic protocol identifiers, or persisted browser keys in the public-brand change.

## Step-by-step tasks

### Phase A — Safe public-brand rename

### Task 1: Add the canonical `phutoshop` brand constant and its first failing test

**Objective:** Establish one source of truth for the frontend public name before changing any UI copy.

**Files:**
- Create: `apps/web/lib/brand.ts`
- Create: `apps/web/tests/brand.test.ts`

**Step 1: Write the failing test**

Create `apps/web/tests/brand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SITE_BRAND } from "@/lib/brand";

describe("public brand", () => {
  it("uses the exact requested website name", () => {
    expect(SITE_BRAND).toBe("phutoshop");
  });
});
```

**Step 2: Run the test to verify failure**

Run from the repository root:

```bash
npx vitest run apps/web/tests/brand.test.ts
```

Expected: FAIL because `@/lib/brand` does not exist yet.

**Step 3: Implement the minimal constant**

Create `apps/web/lib/brand.ts`:

```ts
export const SITE_BRAND = "phutoshop" as const;
```

**Step 4: Run the test to verify pass**

```bash
npx vitest run apps/web/tests/brand.test.ts
```

Expected: `1 passed`.

**Step 5: Commit only the new files**

```bash
git add apps/web/lib/brand.ts apps/web/tests/brand.test.ts
git commit -m "chore: centralize phutoshop brand"
```

If the dirty worktree prevents a clean commit, use `git add -p` and do not stage unrelated hunks.

### Task 2: Rename document metadata and locale-page metadata

**Objective:** Make browser titles, descriptions, Open Graph metadata, Twitter metadata, and localized page titles use `phutoshop`.

**Files:**
- Modify: `apps/web/app/layout.tsx:9-37`
- Modify: `apps/web/app/[locale]/page.tsx:16-28`
- Test: `apps/web/tests/brand.test.ts`

**Step 1: Extend the failing test**

Append to `apps/web/tests/brand.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

it("does not leave the old public brand in web metadata", async () => {
  const files = [
    "apps/web/app/layout.tsx",
    "apps/web/app/[locale]/page.tsx",
  ];
  const contents = await Promise.all(
    files.map((file) => readFile(resolve(process.cwd(), file), "utf8")),
  );

  for (const content of contents) {
    expect(content).toContain("phutoshop");
    expect(content).not.toContain("Pluto Shop");
  }
});
```

Run:

```bash
npx vitest run apps/web/tests/brand.test.ts
```

Expected: FAIL because both metadata files still contain `Pluto Shop`.

**Step 2: Implement the smallest metadata change**

In both files, import `SITE_BRAND` from `@/lib/brand` and replace every public-name literal with the constant. Use template strings for sentences, for example:

```ts
import { SITE_BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: SITE_BRAND,
  description: `Explore creator-friendly digital assets with instant delivery at ${SITE_BRAND}.`,
  applicationName: SITE_BRAND,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: SITE_BRAND,
    title: SITE_BRAND,
    description: "Curated digital goods for designers, developers, and visual storytellers.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_BRAND }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_BRAND,
    description: "Curated digital goods for creative people.",
    images: ["/og.png"],
  },
};
```

In `apps/web/app/[locale]/page.tsx`, return `title: SITE_BRAND` from `generateMetadata`.

**Step 3: Verify the test and typecheck**

```bash
npx vitest run apps/web/tests/brand.test.ts
npm run typecheck --workspace @pluto-shop/web
```

Expected: `2 passed`; TypeScript exits `0`.

**Step 4: Commit the metadata-only change**

```bash
git add apps/web/app/layout.tsx "apps/web/app/[locale]/page.tsx" apps/web/tests/brand.test.ts
git commit -m "chore: rename web metadata to phutoshop"
```

### Task 3: Rename marketplace, payment, header, footer, and accessibility copy

**Objective:** Remove stale visible `Pluto Shop` labels from the main marketplace experience without changing payment behavior or routes.

**Files:**
- Modify: `apps/web/components/marketplace.tsx:160-330,1040-1100,1625-1645,1885-1905`
- Modify: `apps/web/tests/marketplace-query.test.tsx`
- Modify: `apps/web/tests/marketplace-dialogs.test.tsx`
- Modify: `apps/web/tests/payment-method-dialog.test.tsx`
- Modify: `apps/web/e2e/marketplace.spec.ts`
- Modify: `apps/web/e2e/payment-responsive.spec.ts`

**Step 1: Change test expectations first**

Replace only public label expectations:

- `"Pluto Shop home"` → `"phutoshop home"`
- `"Pluto Shop PromptPay payment"` → `"phutoshop PromptPay payment"`
- `"หน้าชำระเงิน Pluto Shop PromptPay"` → `"หน้าชำระเงิน phutoshop PromptPay"`
- `"Pluto Shop TrueMoney Wallet payment"` → `"phutoshop TrueMoney Wallet payment"`
- `"หน้าชำระเงิน Pluto Shop TrueMoney Wallet"` → `"หน้าชำระเงิน phutoshop TrueMoney Wallet"`
- Test description `"Pluto Shop marketplace"` → `"phutoshop marketplace"`.

Do not change `pluto-shop-cart` in e2e/localStorage assertions during this phase; it is a persisted browser-storage key.

Run the affected tests before changing the component:

```bash
npx vitest run apps/web/tests/marketplace-query.test.tsx apps/web/tests/marketplace-dialogs.test.tsx apps/web/tests/payment-method-dialog.test.tsx
```

Expected: FAIL because the component still renders the old public labels.

**Step 2: Implement the component rename**

Import `SITE_BRAND` in `apps/web/components/marketplace.tsx`. Replace visible brand literals with the constant, including:

```tsx
<Link href={`/${locale}`} className="brand" aria-label={`${SITE_BRAND} home`}>
  <span>{SITE_BRAND}</span>
</Link>
```

Use `${SITE_BRAND}` in the bilingual payment dialog names, `paymentPayeeName`, eyebrow, header/footer labels, and any accessible dialog name. Preserve all payment endpoint names, request payloads, idempotency behavior, and provider names.

**Step 3: Run the affected tests to verify pass**

```bash
npx vitest run apps/web/tests/marketplace-query.test.tsx apps/web/tests/marketplace-dialogs.test.tsx apps/web/tests/payment-method-dialog.test.tsx
```

Expected: all targeted files pass. Then run:

```bash
npm run lint --workspace @pluto-shop/web
```

Expected: ESLint exits `0` with no warnings.

**Step 4: Commit only the marketplace rename hunks**

```bash
git add apps/web/components/marketplace.tsx apps/web/tests/marketplace-query.test.tsx apps/web/tests/marketplace-dialogs.test.tsx apps/web/tests/payment-method-dialog.test.tsx apps/web/e2e/marketplace.spec.ts apps/web/e2e/payment-responsive.spec.ts
git commit -m "chore: rename marketplace copy to phutoshop"
```

### Task 4: Rename the not-found page without changing routing

**Objective:** Remove the stale brand from the 404 page while keeping the existing `/th` fallback route and layout.

**Files:**
- Modify: `apps/web/app/not-found.tsx:10-13`
- Test: `apps/web/tests/brand.test.ts`

**Step 1: Extend the failing source assertion**

Add `apps/web/app/not-found.tsx` to the public-file list in `brand.test.ts`, then run:

```bash
npx vitest run apps/web/tests/brand.test.ts
```

Expected: FAIL because `Return to Pluto Shop` remains.

**Step 2: Update the exact copy**

Use the exact requested brand in the CTA:

```tsx
<Link className="primary-button" href="/th">
  Return to phutoshop
</Link>
```

For `Lost beyond Pluto`, use `Lost beyond phutoshop` only if the user wants the existing astronomy wordplay preserved; otherwise use the neutral `Lost beyond the catalog`. Do not invent a new product claim.

**Step 3: Verify**

```bash
npx vitest run apps/web/tests/brand.test.ts
```

Expected: all brand tests pass.

**Step 4: Commit**

```bash
git add apps/web/app/not-found.tsx apps/web/tests/brand.test.ts
git commit -m "chore: update phutoshop not-found copy"
```

### Task 5: Rename Keycloak public presentation and generated production email display name

**Objective:** Update authentication-facing human-readable labels while preserving the realm, client ID, issuer, audience, theme path, and OIDC protocol behavior.

**Files:**
- Modify: `infra/keycloak/realm-export.json:4,28`
- Modify: `infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg` (accessible label only)
- Modify: `infra/keycloak/themes/pluto/login/resources/css/pluto.css:1` (comment only unless the public label appears elsewhere)
- Modify: `infra/production/render-production-realm.mjs`
- Modify: `scripts/production-config.test.mjs`
- Test: `scripts/brand-consistency.test.mjs`

**Step 1: Add the failing renderer assertion**

Change `smtpFromDisplayName: "Pluto Shop"` to `smtpFromDisplayName: "phutoshop"` in `scripts/production-config.test.mjs`, then run:

```bash
node --test scripts/production-config.test.mjs
```

Expected: FAIL because `infra/production/render-production-realm.mjs` still defaults to `Pluto Shop`.

**Step 2: Update public labels only**

Change the realm `displayName`, client human-readable `name`, SVG `aria-label`, theme comment, and production renderer default/display name to `phutoshop`.

Keep these values unchanged in this task:

```text
realm: pluto
clientId: pluto-web
included.custom.audience: pluto-api
loginTheme: pluto
```

They are authentication contracts and require a coordinated realm migration if renamed.

**Step 3: Verify**

```bash
node --test scripts/production-config.test.mjs
```

Expected: all production-config tests pass.

**Step 4: Commit**

```bash
git add infra/keycloak/realm-export.json infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg infra/keycloak/themes/pluto/login/resources/css/pluto.css infra/production/render-production-realm.mjs scripts/production-config.test.mjs
git commit -m "chore: rename auth presentation to phutoshop"
```

### Task 6: Add a repository-level public-brand regression test

**Objective:** Prevent future public-facing files from reintroducing `Pluto Shop` or `PlutoShop` after the rename.

**Files:**
- Create: `scripts/brand-consistency.test.mjs`

**Step 1: Write the failing test**

Create:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const publicFiles = [
  "README.md",
  "docs/production-runbook.md",
  "apps/web/app/layout.tsx",
  "apps/web/app/[locale]/page.tsx",
  "apps/web/app/not-found.tsx",
  "apps/web/components/marketplace.tsx",
  "infra/keycloak/realm-export.json",
  "infra/production/render-production-realm.mjs",
  "infra/keycloak/themes/pluto/login/resources/css/pluto.css",
  "infra/keycloak/themes/pluto/login/resources/img/pluto-mark.svg",
];

const stalePublicBrand = /Pluto Shop|PlutoShop/u;

test("public surfaces use phutoshop and contain no stale public brand", async () => {
  for (const relativePath of publicFiles) {
    const content = await readFile(resolve(process.cwd(), relativePath), "utf8");
    assert.match(content, /phutoshop/u, relativePath);
    assert.doesNotMatch(content, stalePublicBrand, relativePath);
  }
});
```

Run:

```bash
node --test scripts/brand-consistency.test.mjs
```

Expected before all public files are updated: FAIL and identify the first stale path.

**Step 2: Update remaining public documentation/operational copy**

Modify only human-facing brand text in:

- `README.md`
- `docs/production-runbook.md`
- `scripts/dev-compose.mjs` (error/log messages only)
- `infra/production/backup-production.sh`
- `infra/production/deploy-production.sh`
- `infra/production/healthcheck-production.sh`
- `infra/production/restore-check.sh`
- `infra/production/systemd/pluto-shop-backup.service`
- `infra/production/systemd/pluto-shop-health.service`
- `infra/production/systemd/pluto-shop-restore-check.service`
- `infra/production/systemd/pluto-shop-*.timer` descriptions only
- `.env.production.example` (`SMTP_FROM_DISPLAY_NAME` only)

Keep technical command names, file paths, volume names, database names, and service/unit identifiers unchanged in Phase A. Historical files under `.hermes/plans/` are records and should not be rewritten.

**Step 3: Verify the regression and existing script tests**

```bash
node --test scripts/brand-consistency.test.mjs scripts/dev-compose.test.mjs scripts/production-config.test.mjs
```

Expected: all tests pass.

**Step 4: Commit documentation/operations copy only**

```bash
git add README.md docs/production-runbook.md scripts/dev-compose.mjs infra/production/backup-production.sh infra/production/deploy-production.sh infra/production/healthcheck-production.sh infra/production/restore-check.sh infra/production/systemd .env.production.example scripts/brand-consistency.test.mjs
git commit -m "docs: rename public brand to phutoshop"
```

### Task 7: Run the complete Phase-A validation and inspect the browser

**Objective:** Prove the rename changes only identity/copy and does not break the web, API, auth configuration, or deployment checks.

Run from the repository root:

```bash
node --test scripts/brand-consistency.test.mjs scripts/dev-compose.test.mjs scripts/production-config.test.mjs
npm run lint
npm run typecheck
npm test
npm run build
```

Expected:

- Node tests pass.
- ESLint exits `0` with `--max-warnings=0`.
- TypeScript exits `0`.
- Vitest reports all existing web test files passing.
- Next.js production build completes successfully.

Run the API verification without changing dependencies:

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress verify
```

On Windows use:

```bash
apps/api/mvnw.cmd --batch-mode --no-transfer-progress verify
```

Expected: Maven reports `BUILD SUCCESS`.

Run the final stale-public-brand search, excluding historical plans and dependency/build output:

```bash
git grep -n -I -E 'Pluto Shop|PlutoShop' -- ':!\.hermes/plans/**' ':!node_modules/**' ':!apps/web/.next/**' ':!**/target/**'
```

Expected: no matches in the Phase-A public files. Any remaining match must be documented as an intentional internal/protocol identifier, not silently changed.

Run formatting/diff safety checks:

```bash
git diff --check
```

Expected: no output and exit code `0`.

For browser verification, start the existing local stack only in an implementation environment with Docker available:

```bash
npm run dev:docker -- --detach --wait
npm run test:e2e
```

Expected: Playwright passes against the same-origin web app. Manually confirm `/th` and `/en` show `phutoshop` in the document title, header, footer, payment dialog accessible names, and 404 CTA. Stop the stack with `docker compose down` without `--volumes`.

## Phase B — Optional literal technical rebrand (requires explicit approval)

Do not begin this phase merely because the public-brand tests pass. It changes compatibility boundaries and should be a separate migration branch/release.

### Task 8: Create the technical-identifier migration matrix

**Objective:** Decide exactly which internal identifiers will change and define rollback/compatibility behavior before editing them.

**Files to inspect:**
- `package.json`
- `apps/web/package.json`
- `package-lock.json`
- `apps/api/pom.xml`
- `apps/api/src/main/java/com/plutoshop/**`
- `apps/api/src/test/java/com/plutoshop/**`
- `apps/api/src/main/resources/application.yml`
- `.env.example`
- `.env.production.example`
- `compose.yaml`
- `compose.production.yaml`
- `.github/workflows/ci.yml`
- `apps/web/stores/cart.ts`
- `apps/web/e2e/marketplace.spec.ts`
- `apps/web/tests/cart-store.test.ts`
- `infra/keycloak/realm-export.json`
- `infra/production/render-production-realm.mjs`
- `apps/api/src/main/java/com/plutoshop/api/fulfillment/FulfillmentSecretCodec.java`

Create a decision table with these columns before implementation:

```text
old identifier | proposed identifier | persisted/deployed? | migration required | rollback plan | approved?
```

At minimum include `com.plutoshop`, `plutoshop`, `pluto`, `pluto-web`, `pluto-api`, `pluto-shop-cart`, `pluto-shop-*`, `/var/lib/plutoshop`, and `plutoshop-fulfillment-v1`.

**Expected decision:** keep `plutoshop-fulfillment-v1` unchanged unless a versioned decoder/encoder migration is designed; changing it would make existing encrypted fulfillment payloads unreadable.

### Task 9: Migrate the guest cart key compatibly, if approved

**Objective:** Rename `pluto-shop-cart` without losing existing guest carts.

**Files:**
- Modify: `apps/web/stores/cart.ts`
- Modify: `apps/web/tests/cart-store.test.ts`
- Modify: `apps/web/e2e/marketplace.spec.ts`

**TDD sequence:**

1. Add a failing test that seeds valid JSON under `pluto-shop-cart`, hydrates the store, and expects the cart to be available under the new key `phutoshop-cart`.
2. Run:

   ```bash
   npx vitest run apps/web/tests/cart-store.test.ts
   ```

   Expected: FAIL because the current persisted name is `pluto-shop-cart`.
3. Implement a narrowly scoped storage adapter that reads the legacy key once, validates it through the existing numeric ID/quantity normalization, writes the migrated state to `phutoshop-cart`, and removes the old key only after a successful write. Do not copy arbitrary localStorage keys.
4. Run the targeted unit test and the e2e cart persistence tests. Expected: PASS, with legacy data preserved and new sessions using only `phutoshop-cart`.
5. Commit only the cart migration files:

   ```bash
   git add apps/web/stores/cart.ts apps/web/tests/cart-store.test.ts apps/web/e2e/marketplace.spec.ts
   git commit -m "feat: migrate guest cart storage key"
   ```

### Task 10: Rename npm package/workspace identifiers, if approved

**Objective:** Change package metadata without leaving scripts or lockfile workspace references stale.

**Files:**
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Regenerate: `package-lock.json`
- Modify: `.github/workflows/ci.yml` and documentation commands that explicitly mention `@pluto-shop/web`

**TDD/verification sequence:**

1. Change the expected workspace name in a small root script/config assertion first, then run the relevant command and observe the expected workspace-resolution failure.
2. Change root `name` to `phutoshop` and web package `name` to `@phutoshop/web`.
3. Update every `--workspace @pluto-shop/web` reference to `--workspace @phutoshop/web`.
4. Regenerate only the lock metadata:

   ```bash
   npm install --package-lock-only --ignore-scripts
   ```

   Expected: `package-lock.json` root and `apps/web` package names match the new names; dependency versions remain unchanged.
5. Verify:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

   Expected: all commands pass.

### Task 11: Rename Java package/Maven identifiers, if approved

**Objective:** Rename the API namespace in a controlled refactor without leaving imports, tests, or Maven coordinates inconsistent.

**Files:**
- Rename directory: `apps/api/src/main/java/com/plutoshop/` → `apps/api/src/main/java/com/phutoshop/`
- Rename directory: `apps/api/src/test/java/com/plutoshop/` → `apps/api/src/test/java/com/phutoshop/`
- Modify all `package com.plutoshop...` and `import com.plutoshop...` declarations in those directories.
- Modify: `apps/api/pom.xml` (`groupId`, `artifactId`, `name`, `description`)
- Modify: `apps/api/src/main/resources/application.yml` if its application name is intended to change.

**TDD/verification sequence:**

1. Record a clean API baseline:

   ```bash
   cd apps/api
   ./mvnw --batch-mode --no-transfer-progress verify
   ```

   Expected: `BUILD SUCCESS` before the namespace refactor.
2. Perform an IDE/package refactor or a controlled path-aware rename. Do not run a repository-wide blind replacement that can modify docs, secrets, migration content, or generated output.
3. Verify no source/test package references remain:

   ```bash
   git grep -n -I 'com\.plutoshop' -- apps/api/src/main apps/api/src/test
   ```

   Expected: no matches.
4. Run the full Maven verification again. Expected: `BUILD SUCCESS`.
5. Commit the namespace refactor separately from the branding commit.

### Task 12: Rename Compose, database, storage, image, and systemd identifiers, if approved

**Objective:** Apply the infrastructure rename only with a documented data migration and rollback path.

**Files:**
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `compose.yaml`
- Modify: `compose.production.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/dev-compose.mjs`
- Modify: `scripts/dev-compose.test.mjs`
- Modify: `infra/production/backup-production.sh`
- Modify: `infra/production/deploy-production.sh`
- Modify: `infra/production/healthcheck-production.sh`
- Modify: `infra/production/restore-check.sh`
- Rename/update: `infra/production/systemd/pluto-shop-*.service` and `.timer`
- Modify: `docs/production-runbook.md`

**Safety requirements:**

- Do not run `docker compose down --volumes` against an environment containing user data.
- Back up PostgreSQL and the product-media volume before changing database or volume names.
- Provision the new names, restore/copy data, run health checks, and retain the old deployment as rollback until verification completes.
- Keep image registry namespaces and deployment paths coordinated with GitHub Actions, the VPS, and any DNS/secret-manager configuration.

**Verification:**

```bash
docker compose config
npm run test:root
npm run test:production-config
```

Expected: Compose renders successfully and configuration tests pass. Production rollout verification must additionally check `/api/v1/products`, authentication callback/logout, product images, cart persistence, backups, and restore checks before retiring old names.

### Task 13: Rename Keycloak realm/client/audience identifiers, if approved

**Objective:** Change OIDC identifiers only through a coordinated auth migration.

**Files:**
- Modify: `infra/keycloak/realm-export.json`
- Modify: `infra/production/render-production-realm.mjs`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `scripts/dev-compose.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify API resource-server audience configuration and its tests.

**Required behavior:**

- Decide whether to migrate the existing realm or create a new realm. Do not silently create a new production realm and strand existing users.
- Update issuer URLs, client IDs, audience values, redirect/logout URIs, and server validation together.
- Expect existing sessions to require reauthentication; document this before deployment.
- Verify login, signup, logout callback, role claims, audience validation, and admin authorization in both local and production-like environments.

**Verification:**

```bash
node --test scripts/dev-compose.test.mjs scripts/production-config.test.mjs
cd apps/api
./mvnw --batch-mode --no-transfer-progress verify
```

Expected: configuration and API security tests pass, followed by an end-to-end OIDC smoke test against the migrated realm.

## Tests / validation summary

### Required for the default public-brand phase

```bash
node --test scripts/brand-consistency.test.mjs scripts/dev-compose.test.mjs scripts/production-config.test.mjs
npm run lint
npm run typecheck
npm test
npm run build
cd apps/api && ./mvnw --batch-mode --no-transfer-progress verify
cd ../..
git diff --check
```

Expected: all commands exit successfully; no stale public `Pluto Shop`/`PlutoShop` occurrences remain in the declared public files; internal compatibility identifiers are unchanged and documented.

### Browser acceptance checklist

- `/th` document title is `phutoshop`.
- `/en` document title is `phutoshop`.
- Header brand, footer brand, skip-link context, and home accessible label use `phutoshop`.
- PromptPay and TrueMoney dialog accessible names use `phutoshop` while provider behavior is unchanged.
- `/not-a-real-route` retains the existing 404 layout and links to `/th`.
- Login/signup pages show `phutoshop` branding while OIDC issuer/client/audience values remain unchanged in Phase A.
- Guest cart state is not lost because `pluto-shop-cart` is not renamed in Phase A.
- No credentials, tokens, provider payloads, or secret values are added to source, tests, logs, or documentation.

## Risks, tradeoffs, and open questions

1. **Display casing:** This plan assumes exact lowercase `phutoshop`. Confirm whether the visual wordmark should instead be `PhutoShop` while URLs/identifiers remain lowercase.
2. **Public brand versus internal rebrand:** The recommended default changes all customer/operator-facing names but preserves internal contracts. Confirm whether the optional Phase B is also required.
3. **Database and media migration:** Renaming `plutoshop` or `/var/lib/plutoshop/product-media` can orphan existing data or backups. Treat it as a release migration, not a text edit.
4. **OIDC migration:** Renaming `pluto`, `pluto-web`, or `pluto-api` can invalidate sessions and break issuer/audience validation. Coordinate Keycloak, Next.js, API, redirect URIs, and production realm import together.
5. **Guest carts:** Renaming `pluto-shop-cart` without a one-time compatibility read loses existing browser carts. Keep it unchanged unless Task 9 is approved and tested.
6. **Cryptographic compatibility:** Keep `plutoshop-fulfillment-v1` unchanged. If it must change, add a versioned decoder and migration tests before changing the encoder.
7. **Historical plans:** Do not rewrite `.hermes/plans/*.md`; historical records may legitimately contain the old project name.
8. **Dirty worktree:** Existing user changes must remain untouched. Use scoped diffs and `git add -p`; stop and ask if a rename hunk cannot be separated from unrelated work.
9. **External identity:** This plan does not change DNS, `SITE_URL`, GitHub repository name, GHCR ownership, email domains, Keycloak URLs, or payment-provider configuration. Those require separate deployment/provider decisions.

## Recommended commit sequence

1. `chore: centralize phutoshop brand`
2. `chore: rename web metadata to phutoshop`
3. `chore: rename marketplace copy to phutoshop`
4. `chore: update phutoshop not-found copy`
5. `chore: rename auth presentation to phutoshop`
6. `docs: rename public brand to phutoshop`
7. Optional technical migration commits, each isolated by boundary: cart storage, npm metadata, Java namespace, infrastructure names, and OIDC identifiers.

Do not squash or force-reset over the existing unrelated worktree changes. Review the final diff and run the full validation suite before any push or deployment.
