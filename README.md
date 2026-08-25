# Pluto Shop

Marketplace สำหรับ creative assets แบบไทย/อังกฤษ สร้างเป็น Git monorepo โดยแยก Next.js frontend และ Spring Boot API ชัดเจน ระบบนี้เป็น **local/Docker-only** และไม่แก้ไขหรือเผยแพร่ทับ Nebula Studio ซึ่งใช้เป็นเพียง reference แบบอ่านอย่างเดียว

## เริ่มระบบด้วยคำสั่งเดียว

ต้องมี Docker Desktop/Engine และ Docker Compose v2 จากนั้นรันที่ root ของ repository:

```bash
npm run dev:docker -- --detach --wait
```

คำสั่งนี้จะ:

1. สร้าง `.env` ครั้งแรกด้วยรหัสผ่าน PostgreSQL แบบสุ่มสองชุด (owner/migration และ runtime read-only) โดยไม่แสดงรหัสผ่านใน log
2. build `api` image แล้ว start `postgres` → one-shot `migrate` → read-only `api` → `web`
3. รอ health checks ตาม dependency order

เปิด <http://127.0.0.1:3000> (`/` redirect ไป `/th`) และตรวจ API ผ่าน same-origin proxy ได้ที่ <http://127.0.0.1:3000/api/v1/products>

```bash
# ดูสถานะ
docker compose ps

# หยุดระบบโดยเก็บข้อมูลใน named volume
docker compose down
```

> [!CAUTION]
> `docker compose down --volumes` จะลบฐานข้อมูล local ทั้งหมด ใช้เฉพาะเมื่อตั้งใจ reset seed/migration ใหม่เท่านั้น

หากต้องการกำหนดค่าเอง ให้คัดลอก `.env.example` เป็น `.env` และเปลี่ยน placeholder ทั้งสองค่าเป็น secret แบบสุ่มยาว ๆ ก่อนรัน Compose

## โครงสร้าง

```text
.
├── apps/
│   ├── api/                 # Spring Boot 4.1.1 / Java 17 / Maven Wrapper
│   └── web/                 # Next.js 16.3.2 App Router / React / TypeScript
├── infra/postgres/init/     # สร้าง runtime DB role แบบ read-only
├── scripts/                 # secure local Compose bootstrap
├── .github/workflows/ci.yml # lint, tests, builds, Compose + Playwright
└── compose.yaml             # web, one-shot migrate, read-only api, PostgreSQL 18.6
```

### Trust boundaries และการไหลของข้อมูล

```text
Browser ──OIDC/HttpOnly session──> Next.js ──private Compose network──> Spring API ──JPA/read-only──> PostgreSQL
   │                                  │                         │
   └── cart: localStorage              └── Keycloak OIDC          └── ADMIN role gate
Owner secret ──one-shot migrate/Flyway───────────────────────────────────────────────┘
```

- Browser ไม่เห็น database credentials และไม่เรียก PostgreSQL โดยตรง
- PostgreSQL และ Spring API ไม่ publish port ออก host; มีเพียง web ที่ bind `127.0.0.1` และ proxy `/api/*` ไป API ผ่าน private Compose network
- Flyway owner credentials อยู่เฉพาะ one-shot `migrate` container ที่จบก่อน API เริ่ม; long-running API ได้เพียง `pluto_app` และปิด Flyway โดย role นี้มี `SELECT` เฉพาะตาราง `products`
- API ไม่มี CORS เพราะ browser ใช้ same-origin proxy
- Response จาก API ถูกตรวจ schema ก่อน render และไม่ใช้ `dangerouslySetInnerHTML`

## เส้นทางเว็บ

| Path | พฤติกรรม |
|---|---|
| `/` | redirect ไป `/th` |
| `/th` | ภาษาไทย (ค่าเริ่มต้น), THB |
| `/en` | ภาษาอังกฤษ, THB |

ตัวสลับภาษาคง `q`, `maxPriceMinor` และ `inStock` ใน query string ส่วน search หน่วง 250 ms ก่อนเรียก API ตัวกรองและ cart ยังคงอยู่หลัง refresh (filters ผ่าน URL, cart ผ่าน localStorage)

## Authentication และ admin foundation

Compose เริ่ม Keycloak realm `pluto` ที่ `http://127.0.0.1:8081` พร้อม OIDC public client `pluto-web` และ Authorization Code + PKCE:

```text
Login:  http://127.0.0.1:3000/api/auth/login
Signup: http://127.0.0.1:3000/api/auth/signup
Logout: http://127.0.0.1:3000/api/auth/logout (redirect ไป Keycloak โดยตรง; ล้าง cookie หลัง callback)
Admin:  http://127.0.0.1:3000/admin
```

Session ถูกเข้ารหัสใน HttpOnly cookie ด้วย `AUTH_SESSION_SECRET`; access token ไม่อยู่ใน localStorage และ route `/admin` ตรวจ `ADMIN` role ฝั่ง server ส่วน public catalog ยัง anonymous ได้ตามเดิม Spring API ตรวจ JWT issuer/JWK และตอบ `401/403` แบบ sanitized ที่ `/api/v1/admin/*`

หน้า credential ของ Keycloak ใช้ custom theme `pluto` ที่ `infra/keycloak/themes/pluto` เพื่อให้พื้นหลัง, card, focus state, button และโลโก้สอดคล้องกับ Pluto Shop โดยยังคงให้ Keycloak เป็นผู้จัดการ password, session และ OIDC security ทั้งหมด

### Phase 2 cart sync slice

บัญชีที่ผ่าน OIDC จะมี cart ฝั่ง server โดยยึด `issuer + sub` เป็นเจ้าของ:

```text
GET    /api/v1/cart
PUT    /api/v1/cart
POST   /api/v1/cart/merge
DELETE /api/v1/cart
```

Guest cart ยังคงอยู่ใน browser เฉพาะ numeric product IDs/quantities และจะ merge หลัง login โดย API ตรวจ product/stock/quantity จากฐานข้อมูลจริงเสมอ Next.js แนบ access token ผ่าน encrypted HttpOnly cookie ไปยัง BFF เท่านั้น ไม่ส่ง token ให้ client JavaScript หรือ `localStorage`; refresh token ถ้ามีจะอยู่ใน encrypted HttpOnly cookie แยกต่างหากและใช้ refresh server-side เท่านั้น ส่วน `pluto_app` ยังคง read-only และ `pluto_user` เขียนได้เฉพาะตาราง identity/cart

### Phase 3 admin catalog slice

หน้า `/admin` มี catalog console สำหรับ admin เท่านั้น โดย BFF ใช้ same-origin และ backend ตรวจ `ROLE_ADMIN` ทุกครั้ง:

```text
GET    /api/v1/admin/products
POST   /api/v1/admin/products
PATCH  /api/v1/admin/products/{id}
PATCH  /api/v1/admin/products/{id}/stock
DELETE /api/v1/admin/products/{id}?version={version}
```

Admin เพิ่ม/แก้สินค้าและ stock ได้ รวมถึง archive สินค้าแบบ soft delete สินค้าที่ archive จะหายจาก public catalog และเพิ่มเข้า cart ใหม่ไม่ได้ แต่ยังเก็บข้อมูลสำหรับ cart/order/audit ส่วน `pluto_admin` เป็น database role แยกสำหรับ catalog/audit mutations; `pluto_user` และ `pluto_app` ไม่มีสิทธิ์เขียน products

การ signup ใน dev realm ปิด email verification เพื่อให้ local flow ใช้ได้โดยไม่ต้องมี SMTP; production ต้องเปิด verification, ตั้ง HTTPS และใช้ secret manager ก่อนเปิดใช้งานจริง

สำหรับทดสอบ admin ให้เปิด `http://127.0.0.1:8081/admin` ใช้ค่า `KEYCLOAK_ADMIN` และ `KEYCLOAK_ADMIN_PASSWORD` จาก `.env` จากนั้นสร้าง user ทดสอบและ assign realm role `ADMIN` ใน realm `pluto` โดยไม่ใส่ credential ลง Git

## Public API

### `GET /api/v1/products`

Query parameters:

| Parameter | รูปแบบ | ความหมาย |
|---|---|---|
| `q` | string สูงสุด 120 ตัวอักษร | ค้นชื่อ/คำอธิบายไทยและอังกฤษ |
| `maxPriceMinor` | integer `>= 0` | ราคาสูงสุด หน่วยสตางค์ |
| `inStock` | `true` หรือ `false` | มีสินค้า/สินค้าหมด; หากไม่ส่งจะไม่กรอง stock |

ตัวอย่าง:

```bash
curl 'http://127.0.0.1:3000/api/v1/products?q=Aurora&maxPriceMinor=119000&inStock=true'
```

รูปแบบ response:

```json
{
  "items": [
    {
      "id": 1,
      "slug": "creator-launch-kit",
      "nameTh": "ชุดเปิดตัวสำหรับครีเอเตอร์",
      "nameEn": "Creator Launch Kit",
      "descriptionTh": "สินทรัพย์สี่รายการที่จัดเข้าชุดสำหรับครีเอเตอร์เตรียมเปิดตัวสินค้าดิจิทัลอย่างมืออาชีพ",
      "descriptionEn": "Four coordinated launch assets for creators preparing a polished digital release.",
      "visualCode": "CL",
      "type": "BUNDLE",
      "selectionMode": "SINGLE_OPTION",
      "optionGroup": null,
      "optionLabelTh": null,
      "optionLabelEn": null,
      "priceMinor": 101500,
      "currency": "THB",
      "stockQuantity": 1,
      "bundleItemCount": 4,
      "instantDelivery": true,
      "catalogOrder": 1
    }
  ],
  "total": 36,
  "priceRange": {
    "minMinor": 21000,
    "maxMinor": 126000,
    "currency": "THB"
  }
}
```

ค่าที่ไม่ถูกต้องตอบ `400 application/problem+json` ตาม RFC 9457 โดยไม่ส่ง stack trace หรือ internal path กลับผู้ใช้

### `GET /actuator/health`

ใช้โดย Compose health check และเปิดเฉพาะ health endpoint ที่จำเป็น

## ข้อมูลสินค้าและราคา

Flyway migration สร้าง schema และ seed creative assets 36 รายการ เรียงตาม `catalogOrder` โดยยึดชื่ออังกฤษ, visual code, ราคา USD, จำนวน stock/bundle และลำดับจาก screenshot ต้นแบบแบบอ่านอย่างเดียว ส่วนชื่อไทยและคำอธิบายสองภาษาถูกเขียนใหม่สำหรับ Pluto Shop เพราะต้นแบบไม่แสดงคำอธิบายสินค้า Bundle ดิจิทัลใช้ `stockQuantity=1` เป็น availability sentinel และเก็บจำนวนจริงใน `bundleItemCount`

ราคาเป็นค่าคงที่หน่วยสตางค์ตามสูตร:

```text
reference USD × 35 × 100 = priceMinor (THB satang)
```

ระบบไม่เรียก exchange-rate API ภายนอก

`selectionMode` ควบคุม interaction ของหน้าหลัก:

- `SINGLE_OPTION`: กดการ์ดแล้วเปิดรายละเอียดทันที
- `MULTI_OPTION`: สินค้าที่มี `optionGroup` เดียวกันจะถูกรวมเป็นกลุ่มบนหน้าหลัก และต้องเลือก `optionLabelTh`/`optionLabelEn` ก่อนเปิดรายละเอียดของ option นั้น

ฟิลด์ `type` และ `bundleItemCount` เดิมยังคงอยู่เพื่อรักษาความหมายของ catalog bundle รุ่นเก่า; `selectionMode` เป็นเงื่อนไขใหม่สำหรับการเลือก option โดยเฉพาะ

## การพัฒนาและตรวจสอบ

### Frontend

Node ที่ host ต้องเป็น `>=20.9.0` (Node 22.14+ ใช้งานได้; container ใช้ Node 24):

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

ไอคอนรถเข็นใช้ asset จาก [Icons8 Shopping Cart](https://icons8.com/icon/kqlTT3Fp2Ga1/shopping-cart) และ bundle เป็นไฟล์ local เพื่อไม่เรียก external asset ตอน runtime

### Backend

ต้องมี Java 17 เมื่อรันบน host; Maven Wrapper จะจัดการ Maven ให้:

```bash
cd apps/api
./mvnw verify
```

Integration tests ใช้ PostgreSQL 18.6 ผ่าน Testcontainers จริง ไม่ใช้ H2

### E2E กับ stack จริง

```bash
# ครั้งแรกบนเครื่อง: ติดตั้ง browser binary ของ Playwright
npx playwright install chromium

npm run dev:docker -- --detach --wait
npm run test:catalog
npm run test:e2e
```

`test:catalog` เทียบ API/Next proxy จริงกับ source catalog ทั้ง 36 รายการ (ลำดับ ชื่อ visual code สูตรราคา stock/bundle และ validation) ส่วน Playwright ทดสอบ catalog 36 รายการ, API-driven filters, refresh persistence, cart, ภาษา, keyboard labels และ viewport 375/768/1280 โดยไม่ใช้ mock API

## CI

`.github/workflows/ci.yml` แยก jobs สำหรับ:

- web lint / type-check / unit tests / production build
- API Testcontainers tests / package
- Compose build + health checks + Playwright E2E

GitHub Actions ภายนอกถูก pin ด้วย commit SHA และ workflow ใช้ `contents: read` เท่านั้น

## เวอร์ชันหลัก

- Next.js `16.3.2` — Node minimum `20.9.0`: <https://nextjs.org/docs/app/getting-started/installation>
- Keycloak `26.4.0` — local OIDC realm/client
- Node `24.18.0` ใน container; Node release status: <https://nodejs.org/en/about/previous-releases>
- Spring Boot `4.1.1`: <https://spring.io/blog/2026/08/20/spring-boot-4-1-1-available-now/>
- PostgreSQL `18.6`: <https://www.postgresql.org/docs/18/>

## ยังไม่รวมในรอบนี้

Checkout/payment, order lifecycle, user profile UI, download delivery, Redis, object storage/R2, deployment, Sites และ VPS ยังไม่รวมในเฟสนี้ ปุ่มที่ยังไม่เปิดใช้จะแสดงเป็น phase ถัดไปโดยไม่มี broken links
