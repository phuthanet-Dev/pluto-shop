# Admin Redesign — Concise Implementation Plan

**Goal:** Simplify Phuto Shop admin workflows without changing existing API, authentication, payment, or data contracts.

**Approach:** Use Impeccable Operate principles: Thai labels, clear hierarchy, restrained existing branding, progressive disclosure, and accessible responsive controls. Retain `/admin` server authorization; introduce a client workspace for task navigation.

## Implementation sequence

1. **Establish baseline**
   - Inspect current Git changes and run existing admin tests; preserve unrelated work.
   - Files: `apps/web/tests/admin-products-console.test.tsx`, `apps/web/tests/admin-fulfillment-console.test.tsx`.

2. **Separate tasks**
   - Create `apps/web/components/admin-workspace.tsx` and mount it in the authorized branch of `apps/web/app/admin/page.tsx`.
   - Show either Products or Fulfillment, not both. Keep session/ADMIN checks unchanged.
   - Add `apps/web/tests/admin-workspace.test.tsx` and `apps/web/tests/admin-page.test.tsx`.

3. **Simplify product editing**
   - Update `apps/web/components/admin-products-console.tsx`: replace list with focused editor; preserve search on return; use visible Thai action labels.
   - Put shared product content before child options; collapse advanced fields and individual option details without losing values.
   - Preserve IDs, versions, atomic multi-create, required TH/EN content and image-upload contracts.
   - Extend product tests for these interactions and payload invariants.

4. **Protect navigation and sensitive operations**
   - Confirm leaving dirty forms; block navigation while mutations run; restore keyboard focus.
   - Update `apps/web/components/admin-fulfillment-console.tsx`: bind mutations to successfully loaded SKU, ignore stale responses, clear secret state on confirmed exit/SKU change.
   - Separate delivery settings, inventory and import tools; retain explicit reveal and add targeted destructive-action confirmations.
   - Extend fulfillment tests with wrong-target/stale-response and secret-clearing cases.

5. **Apply responsive visual design**
   - Add scoped `apps/web/app/admin/admin.css`; avoid changing public storefront styles.
   - Keep LINE Seed Sans and restrained dark/violet branding, readable Thai copy, 44px controls, visible focus and reduced-motion support.
   - Update `apps/web/e2e/admin-form-layout.spec.ts`; add `apps/web/e2e/admin-redesign.spec.ts` for actual authenticated React workflows with synthetic data.

6. **Verify and review**
   - For each behavior: write failing test → verify intended failure → minimal implementation → passing test → diff review.
   - Review desktop/mobile in one batch, fix identified defects, then perform one confirmation pass.
   - Commit only scoped changes when authorized; do not push, deploy or restart without approval.

## Verification commands

Run from `D:/workspace/Person/PlutoShop`:

```bash
npm test
npm run lint --workspace @pluto-shop/web
npm run typecheck --workspace @pluto-shop/web
npm run build --workspace @pluto-shop/web
npm run test:e2e --workspace @pluto-shop/web -- e2e/admin-form-layout.spec.ts e2e/admin-redesign.spec.ts e2e/brand.spec.ts
git diff --check
```

Expected: tests pass; lint/typecheck/build/diff-check exit 0. E2E requires a running current build and authorized test authentication. If unavailable, report the blocker; handwritten fixtures do not prove authenticated admin behavior. Never capture real credentials or inventory secrets in traces/screenshots.

## Acceptance and boundaries

- One task visible at a time; clear edit/group/option actions.
- No loss of drafts; no hidden required-field errors or inaccessible controls.
- Existing product/group/image payloads and server permission checks unchanged.
- No stale SKU mutation or secret retention after navigation.
- No horizontal page overflow on mobile; public storefront unaffected.
- No new analytics/dashboard APIs, database changes, payment changes, dependencies, or automatic data deletion.

Detailed reference: `.hermes/plans/2026-09-14_002907-admin-redesign.md`. This concise plan does not authorize implementation.
