# PlutoShop API Security Hardening Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** เพิ่มการตรวจ JWT audience ที่ฝั่ง Spring API และเพิ่มแผน/ชั้นป้องกัน rate limiting/WAF ให้พร้อมก่อนเปิด public production หรือ live payment โดยไม่ทำให้ browser ถือ credential และไม่กระทบ payment/cart authorization เดิม

**Architecture:** คงสถาปัตยกรรม Browser → Next.js BFF → Spring Resource Server → PostgreSQL เดิมไว้ Browser จะไม่เรียก Spring API หรือถือ bearer token โดยตรง Spring API จะตรวจ issuer, signature, time claims, audience และ realm role ก่อน authorization ส่วน rate limiting จะวางสองชั้น: edge WAF/reverse proxy เป็นด่านหลัก และ application-level limiter สำหรับ endpoint ที่มีต้นทุน/ความเสี่ยงสูง โดยใช้ distributed store เมื่อมีหลาย instance

**Tech Stack:** Spring Boot 4.1.1 / Spring Security OAuth2 Resource Server / Java 17, Keycloak 26.4.0, Next.js 16 App Router BFF, Docker Compose, PostgreSQL 18.6, Testcontainers, Playwright

---

## Phase decision

- **JWT audience validation:** จัดเป็น **Phase 1 Auth/Security Foundation hardening** และทำเป็นงานถัดไปทันที ก่อนเปิด live payment หรือ production แม้ Phase 2 cart sync และ Phase 3 admin catalog จะมีอยู่แล้ว
- **Rate limiting/WAF:** จัดเป็น **Phase 4 Production Hardening/Deployment** ออกแบบ contract ได้ตั้งแต่ตอนนี้ แต่ implementation จริงต้องเสร็จก่อน public production, live payment, หรือเปิด endpoint จาก internet
- **ไม่ต้องเพิ่ม WAF ใน local/Docker-only stack ตอนนี้:** Compose ปัจจุบันไม่ publish API port ออก host และยังไม่มี deployment gateway/Redis; ให้ใช้ production-readiness gate แทนการเพิ่ม dependency ที่ไม่จำเป็นใน local

## Current context and assumptions

- `apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java` ใช้ stateless bearer resource server, issuer/JWK configuration, realm-role converter, `ROLE_ADMIN`, protected route matchers และ deny-by-default สำหรับ route ที่ไม่รู้จัก
- `compose.yaml` ตั้ง `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI` และ internal JWK set URI; API มี `expose: 8080` แต่ไม่มี host `ports` mapping
- `apps/web/lib/*-proxy.ts` เก็บ access token ไว้ฝั่ง server ใน encrypted HttpOnly cookie, ตรวจ same-site `Origin` สำหรับ mutation และส่งต่อไปยัง internal API เท่านั้น
- `apps/web/next.config.ts` rewrite เฉพาะ public product catalog; protected cart/payment/admin paths ใช้ BFF route handlers
- `infra/keycloak/realm-export.json` ปัจจุบันมี public client `pluto-web` และ realm-role mapper แต่ยังไม่มี audience contract สำหรับ API ที่ตรวจยืนยันโดย Spring แบบ explicit
- README ระบุว่า deployment, Redis, Sites และ VPS ยังไม่รวมในรอบปัจจุบัน
- ต้องรักษา uncommitted/staged work ที่มีอยู่ เช่น AccountMenu, compose/infra และงาน frontend อื่น ๆ ห้าม reset, clean, stage รวม หรือแก้ไขโดยอัตโนมัติ
- ข้อมูล JWT claim ที่จะใช้เป็นหลักฐานต้องมาจาก disposable test identity หรือ test token ที่สร้างในระบบทดสอบเท่านั้น ห้ามพิมพ์/เก็บ token จริง

## Trust boundaries and security impact

- **JWT audience validation:** ปิดช่อง token ที่ออกให้ client อื่นใน issuer เดียวกันถูกนำมาใช้กับ API โดยไม่ตั้งใจ; ไม่เปลี่ยน identity หลักที่ใช้ issuer + subject และไม่ใช้ email เป็น immutable ID
- **Rate limiting/WAF:** ลด credential stuffing, checkout abuse, payment polling/cancel abuse, และ traffic flood; ไม่ใช่ authorization และไม่แทนที่ JWT/ownership checks
- **Payment safety:** server-calculated cart total, order snapshot, provider amount consistency, idempotency และ cart lock ต้องคงเดิม; ห้ามให้ rate limiter หรือ audience change ทำให้ frontend amount กลายเป็น authority
- **Failure mode:** audience config ผิดต้อง fail closed และตอบ 401/403 แบบ sanitized; rate-limit rejection ต้องเป็น 429 แบบไม่มี token, cookie, request body หรือ provider credential ใน response/log

---

### Task 1: Establish the audience contract from a disposable token

**Objective:** ระบุว่า access token ที่ BFF ส่งไป Spring API มี `iss`, `aud`, `azp`, expiry และ realm roles เป็นอะไรจริง ก่อนเลือกค่า validator

**Files:**
- Inspect: `infra/keycloak/realm-export.json`
- Inspect: `apps/web/lib/auth-server.ts`
- Inspect: `apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java`
- Document decision in: `README.md` (security/auth section; no token values)

**Step 1: Collect claims safely**

- ใช้ disposable local Keycloak user/client flow หรือ test fixture ที่ไม่ใช่ credential จริง
- ตรวจเฉพาะชื่อ claim และค่าแบบ redacted/boolean เช่น audience membership, issuer match และ role presence
- ห้ามพิมพ์ access token, refresh token, cookie, Authorization header หรือ raw login response

**Step 2: Choose the contract**

- แนะนำ API-specific audience เช่น `pluto-api` หากสามารถเพิ่ม Keycloak audience mapper ได้
- หากเลือก `pluto-web` หรือ audience เดิม ต้องบันทึกเหตุผลและยืนยันว่า access token มีค่านี้จริง
- กำหนด behavior เมื่อ audience config หาย: production fail closed/startup failure ไม่ใช่ปิด validator เงียบ ๆ

**Step 3: Record acceptance criteria**

- Correct issuer + correct audience + valid signature/time claims → authenticated
- Missing or wrong audience → `401` sanitized
- Correct audience แต่ไม่มี `ADMIN` → public/customer rules ยังทำงาน, admin → `403`
- Public `GET /api/v1/products` ยัง anonymous ได้

**Step 4: Commit boundary**

ยังไม่ commit จนกว่าจะมี failing tests ใน Task 2 และยืนยันว่า audience contract ไม่ต้องใช้ secret

---

### Task 2: Add failing audience-validator tests

**Objective:** สร้าง regression tests ที่แยก issuer/signature/time validation ออกจาก audience validation ได้ชัดเจน

**Files:**
- Create: `apps/api/src/test/java/com/plutoshop/api/security/JwtAudienceValidatorTest.java`
- Modify if needed: `apps/api/src/test/java/com/plutoshop/api/ProductApiIntegrationTest.java`
- Modify if needed: `apps/api/src/test/java/com/plutoshop/api/payment/PromptPayPaymentApiIntegrationTest.java`

**Step 1: Write RED unit tests**

ทดสอบ validator ด้วย synthetic `Jwt` ที่ไม่มี token จริง:

```java
@Test
void acceptsJwtWithExactApiAudience() {
    // build a synthetic Jwt with the configured issuer and aud=["pluto-api"]
    // assert validation has no errors
}

@Test
void rejectsJwtWithMissingOrDifferentAudience() {
    // aud missing and aud=["another-client"] must produce validation errors
}
```

เพิ่มกรณี `aud` แบบ string/array ตามรูปแบบที่ Keycloak ใช้จริง และยืนยันว่า substring ที่ไม่ตรง exact ไม่ผ่าน

**Step 2: Run RED**

Run:

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress -Dtest=JwtAudienceValidatorTest test
```

Expected: FAIL because the validator/configuration is not implemented yet. หาก Maven wrapper local ใช้ไม่ได้ ให้แก้เฉพาะ toolchain หรือรันใน CI; ห้ามสร้างผลลัพธ์จำลอง

**Step 3: Define integration assertions**

เพิ่ม/ปรับ tests ให้ครอบคลุม:

- anonymous public catalog → `200`
- anonymous protected route → `401`
- valid customer audience → authenticated customer behavior
- wrong/missing audience → `401`
- valid audience + `ROLE_CUSTOMER` → admin endpoint `403`
- valid audience + `ROLE_ADMIN` → admin endpoint ผ่าน
- Problem Details ไม่มี token/path/stack trace/raw claims

---

### Task 3: Add Keycloak audience mapper and non-secret configuration

**Objective:** ทำให้ access token มี audience contract ที่ API จะตรวจได้จริง โดยไม่เพิ่ม client secret หรือเปิด token ให้ browser

**Files:**
- Modify: `infra/keycloak/realm-export.json`
- Modify: `apps/api/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Test/inspect: `apps/web/lib/auth-server.ts`

**Step 1: Add the mapper/client-scope configuration**

- เพิ่ม audience mapper/client scope ตาม contract จาก Task 1
- ใช้ค่าคงที่แบบ non-secret เช่น `pluto-api`
- คง public client + Authorization Code + PKCE; ห้ามเพิ่ม client secret ลง realm export
- อย่าแก้ redirect URI ให้กว้างขึ้น

**Step 2: Wire API configuration**

- เพิ่ม property เช่น `spring.security.oauth2.resourceserver.jwt.audience` หรือชื่อ project convention ที่ชัดเจน
- ส่งผ่าน Compose ด้วย environment value ที่ไม่ใช่ secret
- ห้ามใช้ empty audience เป็น implicit bypass เมื่อ issuer เปิดใช้งาน

**Step 3: Verify import behavior safely**

- ใช้ disposable Keycloak data/realm หรือทดสอบบน environment ที่ไม่ต้องลบ named volume ของผู้ใช้
- ห้ามใช้ `docker compose down --volumes` เว้นแต่ผู้ใช้สั่ง reset ข้อมูลโดยตรง
- ตรวจ access-token claim แบบ redacted ว่ามี audience ถูกต้อง

**Step 4: Run GREEN contract tests**

Run:

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress -Dtest=JwtAudienceValidatorTest,ProductApiIntegrationTest,PromptPayPaymentApiIntegrationTest test
```

Expected: all audience, issuer/role, payment ownership และ cart-lock tests pass

---

### Task 4: Implement fail-closed audience validation in Spring

**Objective:** ผูก audience validator เข้ากับ Spring Resource Server โดยคง default issuer/JWK/time validators และ role converter เดิม

**Files:**
- Modify: `apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java`
- Modify: `apps/api/src/main/resources/application.yml`
- Test: `apps/api/src/test/java/com/plutoshop/api/security/JwtAudienceValidatorTest.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/ProductApiIntegrationTest.java`

**Step 1: Implement minimal validator composition**

ใช้ Spring Security validator composition ที่รักษา default issuer/time validation แล้วเพิ่ม exact audience claim validator; รองรับ `aud` เป็น string หรือ collection ตาม token จริง

แนวทางเชิงโครงสร้าง:

```java
JwtValidators.createDefaultWithIssuer(issuer)
// compose with an exact configured audience validator
// reject missing/blank audience when the API issuer is configured
```

- อย่ารับ issuer/audience จาก request
- อย่าใช้ frontend role หรือ hidden UI เป็น authorization
- อย่าเปลี่ยน `ROLE_ADMIN` converter โดยไม่จำเป็น
- คง `.anyRequest().denyAll()` และ sanitized 401/403 response

**Step 2: Run GREEN**

Run the focused security tests and confirm wrong/missing audience fails for the real security boundary used by the app

**Step 3: Review payment/cart effects**

ยืนยันว่า `PromptPayPaymentService` ยัง:

- คำนวณยอดจาก DB cart/product
- ผูก transaction ด้วย issuer + subject
- ใช้ idempotency และ order snapshot
- ไม่รับ amount จาก browser

---

### Task 5: Document audience rollout and commit the auth hardening

**Objective:** ป้องกันการ deploy API validator ก่อน Keycloak mapper/token contract พร้อม และแยก commit ที่ตรวจสอบง่าย

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` only if a new non-secret verification step is necessary

**Step 1: Document rollout order**

1. Apply Keycloak mapper/client scope in disposable/test realm
2. Verify redacted access-token claims
3. Deploy API audience config/validator
4. Run anonymous/customer/admin negative tests
5. Enable production gate only after HTTPS and secret manager are ready

ห้ามใส่ token, cookie, password หรือ client secret ใน README/CI logs

**Step 2: Run full auth/API verification**

```bash
npm run lint
npm run typecheck
npm test
npm run build
cd apps/api && ./mvnw --batch-mode --no-transfer-progress verify
```

**Step 3: Commit only audience scope**

```bash
git add apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java \
  apps/api/src/test/java/com/plutoshop/api/security/JwtAudienceValidatorTest.java \
  apps/api/src/test/java/com/plutoshop/api/ProductApiIntegrationTest.java \
  apps/api/src/test/java/com/plutoshop/api/payment/PromptPayPaymentApiIntegrationTest.java \
  apps/api/src/main/resources/application.yml .env.example compose.yaml \
  infra/keycloak/realm-export.json README.md
git diff --cached --check
git commit -m "fix: bind API access tokens to audience"
```

ก่อน stage ให้ตรวจ `git status` และไม่รวม AccountMenu, compose/infra changes เดิม หรือ untracked user work

---

### Task 6: Define the rate-limit/WAF threat model and policy

**Objective:** กำหนด policy ที่วัดผลได้ก่อนเลือก WAF/provider/library และไม่ทำให้ local tests flake

**Files:**
- Create: `.hermes/plans/` follow-up design only if policy needs a separate approval
- Modify later: `README.md` production-hardening section
- Inspect later: deployment gateway configuration (ยังไม่มีใน repo ปัจจุบัน)

**Step 1: Define endpoint classes**

Recommended initial classes:

| Endpoint | Key | Initial policy decision |
|---|---|---|
| OIDC login/signup | trusted proxy IP | strict burst + sustained limit |
| `POST /api/v1/checkout/promptpay` | issuer+subject and IP | strict; idempotency is not a substitute |
| payment check/cancel | issuer+subject+transaction class | prevent polling/cancel flood |
| cart PUT/merge/DELETE | issuer+subject and IP | moderate limit |
| public product catalog | IP/edge cache | broad limit/cache, preserve anonymous access |
| admin writes | issuer+subject + IP | strict and audited |

**Step 2: Define response/logging contract**

- Exceeding budget → HTTP `429`
- Optional `Retry-After` based on policy
- Sanitized body: no token, cookie, body, provider URL, credential, or database detail
- Metrics/log categories only: route class, status, coarse key type, duration; never raw subject/token/IP if policy does not require it

**Step 3: Define proxy trust**

- Only trust `X-Forwarded-For` from a configured trusted reverse proxy
- If no trusted proxy exists, use the connection peer address
- Do not allow clients to choose their own rate-limit identity

**Step 4: Preserve local behavior**

- Local Compose remains usable without a public WAF
- Use deterministic in-memory fake store in tests
- Production multi-instance mode must use Redis or an equivalent distributed store; do not pretend process-local counters are production-safe

---

### Task 7: Add failing rate-limit policy/store tests

**Objective:** ทดสอบ policy และ atomic counter behavior ก่อนเลือก implementation dependency

**Files:**
- Create later: `apps/api/src/main/java/com/plutoshop/api/security/RateLimitPolicy.java`
- Create later: `apps/api/src/main/java/com/plutoshop/api/security/RateLimitStore.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/security/RateLimitPolicyTest.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/security/RateLimitFilterTest.java`

**Step 1: Write RED tests**

Cover:

- requests inside budget pass
- next request after budget returns 429
- separate user/IP keys do not share a bucket accidentally
- payment endpoint has stricter policy than catalog GET
- `Retry-After` is bounded and deterministic
- no sensitive values appear in response or captured log fields
- idempotency keys do not create an unlimited bypass

**Step 2: Run RED**

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress -Dtest=RateLimitPolicyTest,RateLimitFilterTest test
```

Expected: FAIL because policy/filter/store are not implemented

---

### Task 8: Implement application limiter and deployment WAF separately

**Objective:** เพิ่ม defense-in-depth โดยไม่ใช้ process-local limiter เป็นตัวควบคุม production เพียงชั้นเดียว

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/security/RateLimitProperties.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/security/RateLimitFilter.java` or a Spring Security-compatible component
- Create: `apps/api/src/main/java/com/plutoshop/api/security/RateLimitStore.java`
- Create: distributed implementation under an explicitly approved Redis/gateway integration path
- Modify: `apps/api/src/main/resources/application.yml`
- Modify: `apps/api/pom.xml` only after reviewing an established, maintained dependency and pinning by project convention
- Modify later: deployment gateway/WAF config (not present in current repo)

**Step 1: Choose implementation boundary**

- Prefer managed edge WAF/rate limiting for internet-facing traffic
- Add application limiter for expensive/authenticated endpoints as fallback
- For multiple API instances, use Redis/managed distributed store with atomic increment/expiry
- Do not add a suspicious or similarly named package; verify exact artifact, maintenance and transitive behavior before installation

**Step 2: Implement fail-safe behavior**

- Reject malformed route/key inputs safely
- On limiter-store outage, choose an explicit production policy: fail closed for checkout/admin/auth-sensitive routes; do not silently remove limits
- Keep authentication and object authorization running after rate-limit check
- Never log bearer token, cookie, payload, payment QR URL, provider response or credential

**Step 3: Run GREEN tests**

```bash
cd apps/api
./mvnw --batch-mode --no-transfer-progress -Dtest=RateLimitPolicyTest,RateLimitFilterTest test
```

**Step 4: Add edge policy**

Configure the selected deployment gateway/WAF with the same endpoint classes and conservative limits. Keep API inaccessible from the public network except through the trusted gateway.

---

### Task 9: Production verification and separate rate-limit commit

**Objective:** ยืนยันว่าความปลอดภัยไม่ทำลาย public catalog, auth, payment, cart lock หรือ admin authorization

**Files:**
- Test: API security/rate-limit tests
- Test: `apps/web/e2e/marketplace.spec.ts`
- Test: payment/cart-lock E2E files
- Modify docs/config only within the approved rate-limit scope

**Step 1: Full local/CI gates**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:catalog
npm run test:e2e
cd apps/api && ./mvnw --batch-mode --no-transfer-progress verify
cd ../.. && docker compose config --quiet
```

If local Maven wrapper remains broken (`MavenWrapperMain` missing), stop and repair/restore the wrapper or rely on CI output; never replace API test output with an assumed result.

**Step 2: Runtime checks**

- `GET /api/v1/products` anonymous remains `200`
- cart/admin without session remain `401`
- wrong-Origin mutations remain `403`
- authenticated wrong-audience token remains `401`
- within-limit authenticated requests work
- over-limit requests return sanitized `429`
- API port is not published directly; only the trusted web/gateway path is reachable
- health endpoint remains available without exposing health details

**Step 3: Security review**

- inspect `git diff --check`
- scan staged additions for secrets, tokens, shell execution and raw HTML
- verify no `.env`/credential files, tokens or test artifacts are staged
- review rate-limit bypasses, proxy-header trust and fail-open paths
- verify uncommitted user work remains untouched

**Step 4: Commit only rate-limit/WAF scope**

```bash
git status --short --branch
git add <only-approved-rate-limit-and-gateway-files>
git diff --cached --check
git commit -m "feat: add production API rate limiting"
```

Do not combine this commit with audience, AccountMenu, payment UI, migrations or unrelated infrastructure work.

---

## Risks, tradeoffs, and open questions

1. **Audience choice:** The correct value depends on the real Keycloak access-token `aud` claim. Resolve this in Task 1 before coding; do not guess.
2. **Keycloak persistent volume:** Realm export changes may not re-import into an existing named volume automatically. Test with a disposable realm/volume and avoid destructive local resets.
3. **Audience rollout outage:** Deploy mapper/token configuration before enabling strict API validation, but keep the API fail-closed once the production gate is enabled.
4. **Rate-limit false positives:** Use separate authenticated-subject and IP dimensions, endpoint classes and `Retry-After`; do not use one global limit.
5. **Distributed consistency:** Process-local counters are acceptable only for unit tests/single-node local experiments. Production requires edge enforcement or an atomic distributed store.
6. **Proxy identity spoofing:** Never trust forwarded IP headers unless the immediate peer is a configured trusted proxy.
7. **CSRF boundary:** Keep Spring CSRF disabled only for the stateless bearer API boundary; BFF Origin checks remain required for browser mutations. Do not introduce cookie-authenticated API writes without CSRF protection.
8. **Current tooling blocker:** The local Maven wrapper currently cannot load `MavenWrapperMain`; repair the toolchain before claiming fresh backend verification.
9. **Scope preservation:** Existing uncommitted AccountMenu/compose/infra/migration work is user work and must remain unmodified and unstaged unless separately authorized.

## Definition of done

- [ ] Spring API rejects missing/wrong audience with sanitized 401 while preserving issuer/signature/expiry and role checks
- [ ] Keycloak access-token audience contract is verified with a disposable identity and documented without secrets
- [ ] Public catalog and existing BFF/auth/cart/payment/admin behavior remain intact
- [ ] Endpoint-specific rate-limit policy is documented and tested
- [ ] Production edge WAF/rate limiting and application fallback are configured before public/live payment
- [ ] 429 behavior is sanitized, observable and does not log sensitive data
- [ ] Full frontend/API/Compose/E2E gates pass in a real environment
- [ ] Final diffs contain no secrets, test artifacts or unrelated user changes
- [ ] Audience and rate-limit changes are separate, reviewable commits
