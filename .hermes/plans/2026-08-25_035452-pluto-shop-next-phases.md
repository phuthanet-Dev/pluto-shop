# Pluto Shop Next Phases Implementation Plan

> **For Hermes:** Use test-driven-development and subagent-driven-development when executing this plan task-by-task.

**Goal:** Extend the read-only Pluto Shop catalog into a secure authenticated marketplace with guest/user cart sync, an admin catalog/stock console, and a later checkout/order flow.

**Architecture:** Keep the browser same-origin through the Next.js proxy. Use Keycloak as the OIDC identity provider for local/Docker development, Next.js as the session/BFF boundary with HttpOnly cookies, and Spring Boot as the trusted resource server that enforces authorization. Keep public catalog reads anonymous and separate all admin writes behind a dedicated write path and database role.

**Tech Stack:** Keycloak + OIDC Authorization Code with PKCE, Next.js App Router, Spring Security Resource Server, PostgreSQL/Flyway, Zustand cart migration, Testcontainers, Playwright, Docker Compose.

---

## Current context and decisions

- Current repository: `D:\workspace\Person\PlutoShop`.
- Current branch is clean but has local commits not yet pushed to `origin/main`.
- Public catalog is working and read-only: 36 seeded products, Thai/English, THB, same-origin `/api/*` proxy.
- Current cart is local-only and persists only numeric product IDs in `pluto-shop-cart`; product details are fetched from the API when the drawer opens.
- Current public API exposes only `GET /api/v1/products` and `/actuator/health`.
- There is no authentication, signup/login, admin route, write API, checkout, order, payment, or download delivery yet.
- Runtime database role `pluto_app` must remain read-only. Do not weaken it to support admin writes.
- The existing cart is a guest cart. It should remain usable without login and be merged into a user cart after login.
- Do not store passwords, access tokens, or product data in browser `localStorage`.

## Recommended delivery order

1. Authentication foundation and role model.
2. User account record and guest-cart-to-user-cart synchronization.
3. Admin catalog and stock management.
4. Checkout/order lifecycle without payment provider first.
5. Payment, download delivery, and operational hardening.

The first three phases are the next meaningful milestone. Checkout should not be started until authentication, cart ownership, and stock concurrency are correct.

---

## Phase 1: Authentication foundation

### Objective

Add secure login/signup for customers and a server-enforced `ADMIN` role without building custom password or JWT cryptography.

### Proposed behavior

- Keycloak runs as a separate local Compose service for development.
- Use OIDC Authorization Code + PKCE.
- Signup, login, email verification, password reset, logout, and optional MFA are handled by the identity provider.
- New accounts receive `CUSTOMER` by default.
- `ADMIN` is assigned only by an operator/realm configuration; it is never selectable during signup.
- Public catalog remains accessible anonymously.
- Admin and customer APIs require a validated JWT and role check on the Spring server.
- Next.js stores the session in secure HttpOnly cookies; no access token is placed in localStorage.

### Likely files

- Create: `compose.yaml` Keycloak service and healthcheck configuration.
- Create: `infra/keycloak/realm-export.json` with dev-only realm/client/roles, using placeholders rather than secrets.
- Modify: `apps/web/app/layout.tsx` and a new auth/session boundary.
- Create: `apps/web/app/login/page.tsx` and `apps/web/app/signup/page.tsx` or redirect wrappers to the hosted OIDC flow.
- Modify: `apps/web/proxy.ts` for protected route handling without treating frontend checks as authorization.
- Modify: `apps/api/pom.xml` with the project-approved Spring Security/OAuth2 resource-server dependencies.
- Create: `apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java`.
- Create: `apps/api/src/main/java/com/plutoshop/api/security/CurrentUser.java` or an equivalent trusted subject mapper.
- Modify: `apps/api/src/main/resources/application.yml` with issuer/JWK configuration through environment variables.
- Modify: `.env.example`, `README.md`, and CI Compose bootstrap.

### TDD and verification slices

1. Write failing API tests proving anonymous `GET /api/v1/products` remains `200`, missing credentials on admin endpoints are `401`, and a non-admin customer token is `403`.
2. Write failing token-claim mapping tests for issuer, subject, and `ADMIN` role.
3. Implement Spring resource-server validation with issuer/JWK discovery over HTTPS-configured endpoints.
4. Add OIDC login/session tests for Next.js; assert HttpOnly/SameSite cookie properties and that tokens never appear in HTML, localStorage, or logs.
5. Add Playwright tests for signup/login redirect, logout, anonymous catalog access, and protected admin route.
6. Run API Testcontainers tests, frontend unit tests, full build, and Compose health checks.

### Security gates

- No password grant and no custom password hashing.
- No JWT validation only in the browser.
- No `localStorage` access token.
- Deny-by-default admin authorization on the Spring server.
- Validate issuer, audience/client, signature, expiry, and role claim.
- Use separate dev secrets generated outside Git; never commit Keycloak admin credentials.
- Rate limiting and brute-force controls are enabled in the identity provider before production use.

### Acceptance criteria

- A new user can signup, verify email in the configured dev flow, login, and receive `CUSTOMER`.
- An admin can reach `/admin`; a customer cannot.
- Public catalog works when logged out.
- API returns sanitized `401/403` responses without token or stack-trace leakage.
- Login state survives refresh but logout removes the session.

---

## Phase 2: User account and cart synchronization

### Objective

Turn the current guest cart into an account-owned cart while preserving a guest cart and safely merging it after login.

### Proposed data model

Create a user-owned cart model rather than trusting product data from the browser:

- `app_users`: identity subject (`issuer + sub`), email, display name, timestamps, status.
- `carts`: user ID, status, timestamps, version for optimistic locking.
- `cart_items`: cart ID, product ID, quantity, timestamps, unique `(cart_id, product_id)`.

Store only guest cart IDs/quantities locally. On login:

1. Load the server cart for the authenticated subject.
2. Validate each guest product against current catalog/stock.
3. Merge valid items with bounded quantities.
4. Remove invalid/out-of-stock items from the active cart response with a user-safe message.
5. Clear only the guest cart after a successful server merge.

### Likely files

- Create Flyway migrations under `apps/api/src/main/resources/db/migration/` for users/carts/items.
- Create API entities/repositories/services under `apps/api/src/main/java/com/plutoshop/api/cart/` and `/user/`.
- Add authenticated `GET/POST/PATCH/DELETE /api/v1/cart` endpoints.
- Replace or adapt `apps/web/stores/cart.ts` to support guest state and server hydration.
- Add cart merge handling at the session boundary.
- Update `apps/web/components/marketplace.tsx` and cart drawer for quantities, stock changes, and login state.
- Update README API and local setup documentation.

### TDD and verification slices

1. Add migration tests for unique cart ownership and unique product-per-cart constraints.
2. Add authorization tests preventing one user from reading or modifying another user's cart.
3. Add quantity validation tests: integer, positive, maximum per item, stock bounded.
4. Add merge tests for duplicate guest/server items, unavailable products, and malformed local storage.
5. Add frontend tests for guest cart, authenticated cart, remove, quantity changes, logout, and merge states.
6. Add E2E tests across login → add cart item → refresh → logout/login → merged cart.

### Security gates

- Cart ownership comes from the validated token subject, never a user ID from the request body.
- Use parameterized/JPA queries and object-level authorization on every cart item.
- Do not trust client price, stock, product name, or currency.
- Use optimistic locking/transactional updates to avoid lost cart changes.
- Limit cart size and quantity to prevent abuse.
- Keep database write access out of `pluto_app`; introduce a narrowly scoped API write role only after security review.

### Acceptance criteria

- Guest cart works without login.
- Login merges carts deterministically and safely.
- Cart contents survive refresh and are visible across sessions for the same user.
- Another user cannot access the cart by changing an ID.
- Product price/stock is always read from the trusted API/database.

---

## Phase 3: Admin catalog and stock management

### Objective

Create a protected admin console and write API for product metadata and stock, with auditability and safe concurrency.

### Proposed admin capabilities

- `/admin/products`: searchable 36-item catalog table.
- Edit Thai/English name and description, price in THB satang, instant-delivery flag, active visibility, and catalog order.
- Edit single-item stock and bundle availability/count with explicit validation.
- Create/archive products only if the product lifecycle requirements are agreed; avoid hard deletion of products referenced by carts/orders.
- Show last update time and updating admin subject.
- Display clear validation and conflict errors.

### API shape

- `GET /api/v1/admin/products`
- `POST /api/v1/admin/products`
- `PATCH /api/v1/admin/products/{id}`
- `PATCH /api/v1/admin/products/{id}/stock`
- Optional archive endpoint instead of `DELETE`.

All endpoints require `ROLE_ADMIN` on the Spring server. Keep public `GET /api/v1/products` as the only anonymous catalog read path.

### Likely files

- Create: `apps/web/app/admin/page.tsx` and admin components/forms.
- Create: `apps/web/components/admin/product-form.tsx` and stock editor.
- Create: `apps/web/lib/admin-products.ts` with strict Zod response/request schemas.
- Create API admin controller/service/DTO/validation packages.
- Add migrations for `active`, `updated_at`, `updated_by`, and optimistic-lock version if not already present.
- Modify `V3`/database grants only through a new migration; do not edit applied migrations.
- Modify Compose with a separate write-capable API path only if the security design approves it.
- Add audit table/service for admin mutations.

### TDD and verification slices

1. Write failing authorization tests for customer/anonymous/admin access.
2. Write failing DTO validation tests for negative prices, invalid currency, invalid stock, duplicate slug/code, and invalid bundle fields.
3. Write failing optimistic-lock tests for two admin updates to the same product.
4. Implement admin service with transaction boundaries and audit events.
5. Add frontend form tests for validation, save success, server error, and conflict reload.
6. Add E2E admin tests using a dedicated test admin identity; never use production credentials in CI.
7. Verify runtime DB role permissions: public role cannot write; admin write path can write only intended catalog tables.

### Security gates

- Admin UI protection is not sufficient; all API authorization is server-side.
- No broad `GRANT ALL` and no default privileges for future tables.
- Admin write role gets only required table/sequence privileges.
- Audit actor is derived from the verified token subject, not a client field.
- Use CSRF protection appropriate to cookie-backed mutations.
- Validate upload/asset URLs if admin editing later introduces them; block SSRF and arbitrary file access.
- Never log tokens, passwords, or full request bodies containing private user data.

### Acceptance criteria

- Customer and anonymous users receive `403/401` and cannot mutate products.
- Admin can update price/stock and sees the change on the public catalog after cache invalidation.
- Concurrent edits return a safe conflict instead of silently overwriting data.
- Every mutation creates an audit record with actor, object, changed fields, and timestamp.
- No existing catalog/API/E2E behavior regresses.

---

## Phase 4: Checkout and order lifecycle

### Objective

Add a reliable order flow only after user identity and server cart ownership are complete.

### Scope

- `orders`, `order_items`, immutable price snapshots, currency, totals, and status transitions.
- Reserve/decrement stock transactionally at the correct lifecycle point.
- Order history for customers; order management for admins.
- Payment provider integration only after order state machine and idempotency are tested.
- Do not deliver downloads until payment/order status is verified server-side.

### Security and reliability gates

- Idempotency key for order creation/payment callbacks.
- Never trust totals from the browser.
- Verify webhook signatures and make webhook handling replay-safe.
- Avoid overselling through database transactions/locking.
- Do not store card data; use a PCI-compliant provider.
- Add structured audit/security logs with sensitive-field redaction.

---

## Phase 5: Delivery and production hardening

Only after the earlier phases are stable:

- Object storage/R2 signed download URLs with short expiry.
- Email notifications through a verified provider.
- Redis only if measured cache/session/rate-limit requirements justify it.
- Production HTTPS, secure cookie settings, CSP review, backups, migrations, monitoring, and alerting.
- CI security scanning, dependency update policy, image scanning, secret scanning, and disaster-recovery test.
- Deployment only after environment/secret/rollback procedures are documented.

---

## Cross-phase quality gates

Run for every phase:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:catalog
npm run test:e2e
```

For API/security changes also run:

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress verify
```

And verify:

- `docker compose config --quiet`
- all service healthchecks
- no secrets in Git/diff/logs
- `git diff --check`
- final diff contains only intended files
- independent security/spec review before merge

## Open decisions before implementation

1. Use self-hosted Keycloak for local and production, or Keycloak locally plus Auth0/Clerk/Entra in production?
2. Is signup email verification mandatory before customer cart/order access?
3. Will one admin account be enough initially, or are multiple admin roles needed?
4. Should guest cart quantities be supported now or only one unit per product for the first cart release?
5. When should stock be reserved: add-to-cart, order creation, or successful payment?
6. Which payment provider and download delivery provider will be used later?
7. Should old `pluto-shop-favorites` localStorage be ignored permanently or offered as a one-time migration prompt?
