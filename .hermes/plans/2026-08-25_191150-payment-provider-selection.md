# Payment Provider Selection and Checkout Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Select a payment provider appropriate for a THB-first digital marketplace and implement a secure, idempotent checkout/order boundary without exposing card data or fulfilling downloads from a browser redirect.

**Architecture:** Keep Pluto Shop as the trusted order system. The server creates immutable order snapshots and a provider-hosted checkout session from the validated server cart; the browser only receives a short-lived checkout URL/session reference. Payment status changes come from a signature-verified webhook and an optional server-side provider confirmation, not from client claims. Fulfillment remains a later step gated by a paid order.

**Tech Stack:** Existing Next.js BFF + encrypted HttpOnly OIDC session, Spring Boot 4.1.1/JPA, PostgreSQL/Flyway, Testcontainers, Playwright, provider-hosted Checkout/Payment Elements, signed webhooks, and idempotency keys.

---

## Recommendation

### Primary recommendation: Opn Payments (Omise), Thailand-first

Use **Opn Payments/Omise as the first provider** if Pluto Shop's merchant entity is Thailand-based and the first release is THB-focused. It is the best fit for the stated product constraints because the decision should prioritize Thai-local payment methods, THB settlement, local onboarding, and a hosted/tokenized payment boundary rather than building card handling ourselves.

Before committing commercially, verify the current Opn account/merchant eligibility, supported THB methods for the merchant country, digital-goods policy, settlement currency, refund API, webhook signing mechanism, test environment, and fees. These are account- and country-dependent facts and must not be inferred from documentation alone.

### Secondary option: Stripe Checkout

Choose **Stripe Checkout as the primary provider instead** when international cards, multi-country expansion, strong developer tooling, or a global merchant entity are more important than Thai-local method coverage. Stripe remains a strong future second provider, but adding two providers in the first checkout slice would increase webhook, refund, reconciliation, and support complexity.

Verify Thailand merchant availability, THB settlement, PromptPay/local-method availability for the actual account, and digital-goods restrictions before selecting it.

### Options not recommended as the first implementation

- **2C2P:** Worth evaluating for enterprise/local acquiring requirements, but likely heavier onboarding and integration effort for the current local-only marketplace.
- **PayPal:** Keep as a later optional method, not the primary THB checkout for this catalog; it can introduce weaker local UX, currency friction, and a second dispute/refund model.
- **Manual bank transfer:** Not suitable for automatic digital delivery because payment confirmation and reconciliation become operationally manual.
- **Direct card processing:** Do not implement. It expands PCI scope and creates avoidable credential/security risk.

### Decision gate

Do not add a provider SDK or secret until the merchant/account checks above are confirmed. The provider adapter should be narrow enough that switching between Opn and Stripe does not change order, stock, webhook, or fulfillment invariants.

---

## Current context and assumptions

- Pluto Shop is THB-only and currently local/Docker-only.
- Phase 1 OIDC/Keycloak authentication is complete.
- Phase 2 now has account-owned carts, guest merge, server-side stock validation, a separate `pluto_user` DB role, and an encrypted HttpOnly access-token cookie for the Next BFF.
- `pluto_app` remains read-only for the public catalog.
- No payment provider credentials, order tables, payment events, or download fulfillment exist yet.
- Digital goods must not be delivered until payment is verified server-side.
- No provider secret, webhook secret, or real merchant credential may be committed, logged, placed in URLs, or sent to the browser.
- This plan does not authorize production deployment or a live merchant account change.

---

## Provider-neutral domain contract

Use provider-neutral internal states:

```text
Order:   DRAFT -> PENDING_PAYMENT -> PAID -> FULFILLING -> FULFILLED
                    |                  |
                    v                  v
                 EXPIRED            REFUND_PENDING -> REFUNDED

Payment attempt: CREATED -> PENDING -> SUCCEEDED
                              |             |
                              v             v
                           FAILED       CANCELED
```

Required invariants:

- Server computes subtotal, total, currency, and line-item snapshots from the trusted cart/catalog.
- The browser cannot set price, currency, discount, stock, seller, or order owner.
- Each order has an immutable `issuer + subject` owner and an immutable product/price snapshot.
- Currency must be `THB`; amounts are integer satang.
- An order creation idempotency key is unique per authenticated subject.
- A provider event ID is processed at most once.
- Webhook transitions are monotonic and validated against an explicit state matrix.
- A success redirect without a verified webhook never marks an order paid.
- Stock reservation is transactional and has a bounded expiry; overselling must fail safely.

Suggested API shape:

```text
POST /api/v1/checkout/sessions
  request: { idempotencyKey: string }
  response: { orderId: string, checkoutUrl: string, expiresAt: string }

GET /api/v1/orders/{orderId}
POST /api/v1/payments/webhooks/{provider}
POST /api/v1/orders/{orderId}/cancel
POST /api/v1/orders/{orderId}/refund       # admin-only / policy-gated
```

The Next BFF should expose same-origin routes and attach the access token server-side. Payment webhooks should terminate at Spring, not Next, so signature verification and transactional order transitions stay on the trusted backend.

---

## Implementation tasks

Each task is intentionally small. Follow RED -> GREEN -> REFACTOR, run the focused test after each task, and commit after each coherent task.

### Task 1: Record the provider decision and account checks

**Objective:** Make the provider selection explicit before adding dependencies or secrets.

**Files:**
- Modify: `.hermes/plans/2026-08-25_191150-payment-provider-selection.md`
- Modify: `README.md` only after account checks are confirmed

**Steps:**
1. Confirm merchant country/entity, THB settlement, Thai payment methods, digital-goods policy, refund support, webhook signing, sandbox access, and fees for Opn/Stripe.
2. Record the selected provider and the rejected alternative in the implementation issue/plan.
3. Do not paste API keys or merchant identifiers into Git.

**Verification:** A provider decision exists with written account-level evidence and no secrets.

### Task 2: Add provider-neutral order/payment state tests

**Objective:** Lock down the order/payment state machine before persistence or SDK work.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/order/OrderStatus.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentStatus.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/order/OrderStateMachineTest.java`

**TDD:**
1. Write failing tests for valid transitions, invalid transitions, terminal states, and duplicate success events.
2. Run `./mvnw -B -ntp -Dtest=OrderStateMachineTest test`; expect RED.
3. Implement a small pure state-transition policy.
4. Re-run; expect GREEN.

### Task 3: Create order/payment schema migrations

**Objective:** Persist immutable order snapshots, payment attempts, and webhook idempotency records.

**Files:**
- Create: `apps/api/src/main/resources/db/migration/V6__create_orders.sql`
- Create: `apps/api/src/main/resources/db/migration/V7__create_payment_attempts.sql`
- Create: `apps/api/src/main/resources/db/migration/V8__create_payment_events.sql`
- Test: `apps/api/src/test/java/com/plutoshop/api/order/OrderMigrationIntegrationTest.java`

**Schema requirements:**
- `orders`: issuer, subject, status, currency, subtotal/total satang, idempotency key, timestamps, reservation expiry.
- `order_items`: product ID, slug/name snapshot, unit price snapshot, quantity, line total, currency.
- `payment_attempts`: order ID, provider, provider session/payment ID, status, checkout expiry, safe provider metadata.
- `payment_events`: provider, provider event ID unique, payload hash, received/processed timestamps, processing result.
- Foreign keys and unique constraints must prevent duplicate order ownership/idempotency and duplicate provider events.

**Security:** Never store full webhook payloads if they contain unnecessary personal/payment data; if raw payload retention is required for audit, apply a documented redaction/retention policy.

### Task 4: Add stock reservation transaction tests

**Objective:** Prevent overselling while creating an order from the server cart.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/order/StockReservationService.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/order/StockReservationIntegrationTest.java`

**TDD cases:**
- exact stock succeeds;
- insufficient stock fails without a partial reservation;
- two concurrent reservations cannot both consume the same stock;
- expired reservations can be released safely;
- bundle and single-item quantities use the same server-side rule;
- client-supplied price/stock fields are ignored.

Use a transaction and row-level locking/optimistic versioning appropriate to the final schema. Do not solve concurrency with an in-memory lock.

### Task 5: Implement immutable order creation from the authenticated cart

**Objective:** Create a pending order and reserve stock from the validated cart owner.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/order/Order.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/order/OrderItem.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/order/OrderRepository.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/order/OrderService.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/order/OrderController.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/order/OrderApiIntegrationTest.java`

**TDD cases:**
- anonymous request is 401;
- customer can create an order only from their own cart;
- another subject cannot access the order;
- totals are calculated from trusted product rows;
- currency is always THB;
- repeated idempotency key returns the same order without a second reservation;
- malformed keys, empty carts, excessive quantities, and expired stock return sanitized 400/409 responses.

### Task 6: Add a provider adapter interface

**Objective:** Isolate Opn/Stripe-specific API calls from order logic.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentProvider.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentCheckoutRequest.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentCheckoutResponse.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/payment/PaymentProviderContractTest.java`

Contract requirements:
- create hosted checkout with an idempotency key;
- return only a provider checkout URL/session reference;
- never accept browser totals;
- map provider statuses into internal statuses;
- support cancellation/refund hooks without coupling order state to provider strings.

Keep the initial adapter behind a feature flag/test mode until the provider account is verified.

### Task 7: Implement the selected provider checkout adapter

**Objective:** Create a sandbox hosted checkout session using the selected provider.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/<selected-provider>/...`
- Modify: `apps/api/pom.xml` only if an official maintained SDK is required
- Modify: `compose.yaml`/`.env.example` with placeholders only
- Test: provider adapter contract and WireMock/mock HTTP tests

**Security gates:**
- Pin the exact dependency version if adding an SDK.
- Prefer the provider's official HTTPS API/SDK and inspect its transitive behavior.
- Never pass secrets as command-line arguments.
- Keep provider secrets server-only.
- Use bounded timeouts, retry only safe/idempotent requests, and redact request/response logs.

### Task 8: Add signed webhook handling and idempotency

**Objective:** Mark payments from verified provider events exactly once.

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentWebhookController.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/payment/PaymentWebhookService.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/payment/PaymentWebhookIntegrationTest.java`

**TDD cases:**
- invalid signature is 401/400 and changes nothing;
- valid success event marks order paid once;
- duplicate event returns safely without a second transition;
- out-of-order/contradictory events do not regress a terminal state;
- unknown provider payment ID is rejected safely;
- webhook body is read as raw bytes before parsing/signature verification;
- no token, card data, or full private payload is logged.

### Task 9: Add Next checkout BFF and customer order pages

**Objective:** Start checkout from the authenticated cart without exposing provider secrets or trusting client totals.

**Files:**
- Create: `apps/web/app/api/v1/checkout/sessions/route.ts`
- Create: `apps/web/app/checkout/page.tsx`
- Create: `apps/web/app/orders/[orderId]/page.tsx`
- Create: `apps/web/lib/checkout-api.ts`
- Test: `apps/web/tests/checkout-api.test.ts`
- Modify: `apps/web/components/marketplace.tsx` and cart drawer checkout CTA

**Behavior:**
- no checkout for empty cart;
- BFF returns a server-created order and hosted checkout URL;
- browser redirects only to the returned URL;
- return/cancel pages fetch order state from the server;
- UI never claims “paid” from query parameters alone;
- order ownership is enforced by the API.

### Task 10: Add payment/order E2E and operational documentation

**Objective:** Verify the complete sandbox flow and document failure recovery.

**Files:**
- Modify: `apps/web/e2e/marketplace.spec.ts` or create `apps/web/e2e/checkout.spec.ts`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**E2E matrix:**
- logged-out cart remains usable but checkout redirects to login;
- login → cart → checkout session;
- provider cancel returns to an unpaid order;
- signed success webhook changes order state;
- duplicate webhook is harmless;
- refresh does not duplicate order/payment attempt;
- a second user cannot read the order;
- no provider secret/token/card data appears in HTML, localStorage, URLs, or logs.

---

## Files likely to change

### Database/infrastructure

- `.env.example`
- `scripts/dev-compose.mjs`
- `scripts/dev-compose.test.mjs`
- `compose.yaml`
- `infra/postgres/init/010-create-readonly-role.sh`
- `apps/api/src/main/resources/db/migration/V6__create_orders.sql`
- `apps/api/src/main/resources/db/migration/V7__create_payment_attempts.sql`
- `apps/api/src/main/resources/db/migration/V8__create_payment_events.sql`

### Spring API

- `apps/api/pom.xml`
- `apps/api/src/main/resources/application.yml`
- `apps/api/src/main/java/com/plutoshop/api/order/`
- `apps/api/src/main/java/com/plutoshop/api/payment/`
- `apps/api/src/test/java/com/plutoshop/api/order/`
- `apps/api/src/test/java/com/plutoshop/api/payment/`

### Next.js

- `apps/web/app/api/v1/checkout/sessions/route.ts`
- `apps/web/app/checkout/page.tsx`
- `apps/web/app/orders/[orderId]/page.tsx`
- `apps/web/lib/checkout-api.ts`
- `apps/web/components/marketplace.tsx`
- `apps/web/tests/checkout-api.test.ts`
- `apps/web/e2e/checkout.spec.ts`

Do not modify `apps/web/stores/cart.ts` or the Phase 2 cart API to insert provider-specific logic. Keep payment concerns in checkout/order boundaries.

---

## Verification commands

Run focused tests after each task, then the full gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:root
npm run test:catalog
cd apps/api && ./mvnw --batch-mode --no-transfer-progress verify
cd ../.. && docker compose config --quiet
cd ../.. && docker compose up --build --detach --wait --wait-timeout 240
npm run test:e2e
```

Additional security checks:

- verify `pluto_app` cannot write products or cart tables;
- verify `pluto_user` cannot write products and can write only identity/cart tables;
- verify provider secrets are absent from Git, browser storage, HTML, URLs, and logs;
- verify webhook signature failures and duplicate events are covered;
- verify the application never marks an order paid from a browser return URL alone.

---

## Risks, tradeoffs, and open questions

- **Provider choice:** The recommendation depends on merchant country, settlement, supported Thai methods, digital-goods policy, and commercial onboarding. Verify these before implementation.
- **Single vs multi-provider:** Start with one provider. A second provider should be added only after a real coverage requirement; otherwise reconciliation and refund behavior become unnecessarily complex.
- **Hosted checkout vs embedded elements:** Hosted checkout minimizes PCI and frontend attack surface. Embedded payment elements provide more branding/control but require more integration and security review.
- **Stock reservation TTL:** Too short causes abandoned-payment failures; too long holds inventory. Choose a documented TTL and release job before production.
- **Webhook availability in local Docker:** Use a verified tunnel or provider CLI only for development; never expose a debug webhook without signature verification.
- **Refund policy:** Define partial/full refund rules and whether digital delivery is revoked before connecting refund endpoints.
- **Taxes/receipts:** Confirm whether VAT/tax invoices are needed before finalizing order totals and provider metadata.
- **Token refresh:** The current Phase 2 access cookie is short-lived and does not refresh tokens. Add a deliberate refresh-token strategy or reauthentication policy before long-lived checkout sessions.
- **No production claim:** This plan is for a local/sandbox implementation. Production requires HTTPS, secret management, provider account approval, webhook exposure controls, monitoring, backups, and rollback procedures.
