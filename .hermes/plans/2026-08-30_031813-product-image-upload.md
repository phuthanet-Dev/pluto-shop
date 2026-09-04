# Product Image Upload Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** เพิ่มความสามารถให้ผู้ดูแลระบบอัปโหลด เปลี่ยน และลบรูปปกสินค้าได้อย่างปลอดภัย โดยรูปที่เผยแพร่จะแสดงใน catalog และระบบยังทำงานได้หลัง recreate container

**Architecture:** สำหรับขอบเขตปัจจุบันที่เป็น local/Docker-only ให้ API เขียนไฟล์ลง named volume เฉพาะของ product media (`product-media`) ส่วน PostgreSQL เก็บเฉพาะ metadata และ opaque storage key ไม่เก็บ binary ใน `products` และไม่เขียนลง filesystem layer ของ container เมื่อจะ deploy หลาย instance ให้เปลี่ยน implementation ของ storage interface เป็น S3-compatible/R2 โดยไม่ต้องเปลี่ยน API/UI contract

**Tech Stack:** Spring Boot 4.1.1 / Java 17 / PostgreSQL + Flyway, Next.js 16 App Router / React 19 / TypeScript, Docker Compose, Java ImageIO สำหรับตรวจ JPEG/PNG โดยไม่เพิ่ม dependency ในเฟสแรก

---

## คำแนะนำเรื่องการเก็บไฟล์

| ทางเลือก | ผลกระทบ | คำแนะนำ |
|---|---|---|
| เก็บ binary ใน PostgreSQL `bytea` | backup ใหญ่, query/connection หนัก, DB role ต้องแตะข้อมูล binary | **ไม่เลือก** |
| เก็บใน `apps/web/public` หรือ filesystem layer ของ container | deploy/recreate แล้วไฟล์หาย และ web container ปัจจุบันเป็น read-only | **ไม่เลือก** |
| เก็บใน named volume ที่ mount ให้ API เท่านั้น | เหมาะกับ local single-node, อยู่รอดหลัง `docker compose down`, จำกัด trust boundary ได้ | **เลือกตอนนี้** |
| S3/R2/MinIO object storage | เหมาะกับ production/multi-instance แต่ต้องมี credential, lifecycle และ backup เพิ่ม | **เตรียม abstraction ไว้ แล้วทำภายหลัง** |

### ค่าเริ่มต้นที่เสนอ

- รูปปกสินค้าได้ 1 รูปต่อสินค้าในเฟสนี้ ไม่ทำ gallery, crop, video หรือ SVG
- รับเฉพาะ `image/jpeg` และ `image/png`; ไม่เชื่อ `Content-Type`, extension หรือ filename จาก browser
- จำกัดขนาดไฟล์ที่ server ที่ `5 MiB`, ขนาดภาพสูงสุด `4096 × 4096` และ pixel รวมไม่เกิน `16,777,216`
- สร้าง key ด้วย UUID ฝั่ง server เท่านั้น เช่น `550e8400-e29b-41d4-a716-446655440000`; ไม่ใช้ original filename และไม่เผยแพร่ absolute path
- DB เก็บ `image_key`, `image_content_type`, `image_size_bytes`, `image_width`, `image_height`, `image_sha256` โดย metadata ทั้งชุดต้องเป็น `NULL` พร้อมกันหรือมีค่าครบ
- `imageUrl` ของ public catalog เป็น relative same-origin URL เช่น `/api/v1/product-images/<opaque-key>` ไม่รับ external URL จาก request

## Trust boundaries และ data flow

```text
Admin browser
  └─ same-origin Next.js BFF + Origin check
       └─ server-side access token
            └─ Spring admin multipart endpoint (ROLE_ADMIN)
                 ├─ validate bytes / decode image
                 ├─ write temporary file แล้ว atomic move ลง product-media volume
                 └─ update DB metadata + version + audit

Public browser
  └─ same-origin Next.js rewrite
       └─ public image endpoint
            └─ DB ตรวจว่า key ยังผูกกับสินค้า ACTIVE
                 └─ stream file จาก product-media volume
```

ห้ามให้ browser รู้ access token หรือ database credential และห้ามให้ upload endpoint รับ path/key ที่ผู้ใช้กำหนดเอง การอัปโหลดต้องผ่าน BFF และ backend authorization เหมือน product mutation เดิม

## API contract ที่ต้องยึด

- `POST /api/v1/admin/products/{id}/image?version={n}`
  - `multipart/form-data`
  - field ที่จำเป็น: `file`
  - ต้องมี `ROLE_ADMIN` และ optimistic-lock `version`
  - สำเร็จแล้วคืน `AdminProductResponse` รุ่นใหม่
- `DELETE /api/v1/admin/products/{id}/image?version={n}`
  - ต้องมี `ROLE_ADMIN`
  - clear metadata และคืน `AdminProductResponse` รุ่นใหม่
- `GET /api/v1/admin/products/{id}/image`
  - ต้องมี `ROLE_ADMIN`
  - ใช้สำหรับ preview รูปของสินค้า `HIDDEN`/`INACTIVE` ในหน้า admin
  - ตอบ `404` ถ้าไม่มีรูป
- `GET /api/v1/product-images/{imageKey}`
  - public read เฉพาะ key ที่ผูกกับ product สถานะ `ACTIVE`
  - ตรวจ key format และ DB mapping ก่อนเปิดไฟล์
  - รูปของสินค้า hidden/inactive ต้องไม่ถูกเสิร์ฟผ่าน endpoint นี้
- public `ProductItem` เพิ่ม `imageUrl: string | null`
- admin response เพิ่มเฉพาะ metadata ที่ UI จำเป็น เช่น `hasImage`, `imageContentType`, `imageSizeBytes`, `imageWidth`, `imageHeight`; ไม่คืน absolute path หรือ storage root

## งานที่ต้องทำ

### Task 1: สร้าง contract tests ให้เห็น RED ก่อนแก้ production

**Objective:** ระบุ behavior ของ image metadata, strict response และ upload request ก่อนเขียน implementation

**Files:**
- Modify: `apps/web/tests/products-api.test.ts`
- Modify: `apps/web/tests/admin-products-api.test.ts`
- Modify: `apps/web/tests/admin-products-console.test.tsx`
- Create/modify: `apps/api/src/test/java/com/plutoshop/api/admin/AdminProductApiIntegrationTest.java`

**Steps:**
1. เพิ่ม test ว่า public response รับ `imageUrl` แบบ relative ที่คาดไว้และ reject `https://evil.invalid/...` หรือ absolute path
2. เพิ่ม test ว่า admin response รับ metadata รูปและ strict schema ไม่รับ field storage path
3. เพิ่ม test upload flow ใน client/UI โดยใช้ `File` จริงใน test และยืนยันว่า request ใช้ `multipart/form-data` โดย client ไม่กำหนด boundary เอง
4. เพิ่ม integration test backend สำหรับ anonymous `401`, customer `403`, invalid image `400`, oversized image `413` และ stale version `409`
5. รัน test เฉพาะชุดนี้และยืนยันว่า fail เพราะ field/endpoint ยังไม่มี ไม่ใช่เพราะ test setup ผิด

คำสั่งตัวอย่าง:

```bash
cd apps/web
npm test -- --run tests/products-api.test.ts tests/admin-products-api.test.ts tests/admin-products-console.test.tsx
cd ../api
./mvnw -q -Dtest=AdminProductApiIntegrationTest test
```

### Task 2: เพิ่ม schema migration สำหรับ image metadata

**Objective:** เพิ่มคอลัมน์ metadata แบบ nullable โดยไม่แก้ migration ที่ apply ไปแล้ว

**Files:**
- Create: `apps/api/src/main/resources/db/migration/V23__add_product_image_metadata.sql`
- Modify: `apps/api/src/main/resources/db/migration/V15__document_table_columns.sql` **ห้ามแก้ย้อนหลัง**; ให้เพิ่ม comments ใน V23 แทน

**Steps:**
1. เพิ่ม `image_key VARCHAR(80) UNIQUE`, `image_content_type VARCHAR(32)`, `image_size_bytes BIGINT`, `image_width INTEGER`, `image_height INTEGER`, `image_sha256 CHAR(64)`
2. เพิ่ม check ให้ metadata เป็น all-null หรือ all-present
3. จำกัด content type เป็น `image/jpeg` หรือ `image/png`, size/width/height ต้องเป็นค่าบวก และ hash ต้องเป็น lowercase hex 64 ตัว
4. เพิ่ม `COMMENT ON TABLE/COLUMN` ภาษาไทยตาม convention เดิม โดยระบุว่า DB เก็บ metadata ไม่ใช่ binary
5. ตรวจว่า migration ไม่เปลี่ยนข้อมูลเก่าและไม่เพิ่ม grant ใหม่เกินสิทธิ์ `pluto_admin` ที่มีอยู่
6. รัน migration validation ใน Testcontainers ก่อนทำงานกับ local volume จริง

### Task 3: ทำ storage abstraction และ filesystem implementation

**Objective:** ให้ API validate และเก็บรูปแบบ atomic ลง volume โดยป้องกัน path traversal, symlink และไฟล์ค้าง

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/ProductImageStorage.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/FileSystemProductImageStorage.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/ProductImageMetadata.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/ProductImageValidationException.java`
- Modify: `apps/api/src/main/resources/application.yml`
- Test: `apps/api/src/test/java/com/plutoshop/api/productimage/ProductImageStorageTest.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/productimage/ProductImageValidationTest.java`

**Implementation constraints:**

- ตั้ง root จาก `PRODUCT_MEDIA_ROOT` โดย default เป็น `/var/lib/plutoshop/product-media`
- สร้าง UUID key ด้วย secure random ฝั่ง Java; ห้ามนำ filename มาเป็น path
- เขียนลง temp file ใน root เดียวกัน, จำกัดจำนวน bytes ระหว่างอ่าน, คำนวณ SHA-256 ระหว่างเขียน และใช้ atomic move ไปยัง key ที่ไม่เคยมี
- ตรวจ magic bytes และ decode ด้วย `ImageIO`/`ImageReader`; client `Content-Type` เป็นเพียง hint
- ใช้ `ImageReader` ตรวจ dimension ก่อน full decode; reject corrupt image, zero dimension, เกิน pixel limit และชนิดที่ไม่อยู่ใน allowlist
- อ่าน/ลบได้เฉพาะ key ที่ match UUID format, `resolve(...).normalize()` ต้องอยู่ใต้ root และ target ต้องเป็น regular file ที่ไม่ตาม symlink
- เมื่อเกิด exception ให้ลบ temp/new file ที่สร้างใน operation นั้น โดยไม่ลบไฟล์เก่า
- cleanup temp files ที่ชื่อ pattern ของระบบและเก่าเกิน threshold ได้เฉพาะใน media root; ห้าม scan directory อื่น

**RED → GREEN:** เขียน `@TempDir` tests สำหรับ JPEG/PNG ที่ถูกต้อง, MIME spoof, invalid bytes, oversize, oversized dimensions, traversal key และ replacement cleanup ก่อน implement แล้วรัน:

```bash
cd apps/api
./mvnw -q -Dtest=ProductImageStorageTest,ProductImageValidationTest test
```

### Task 4: ต่อ product model และ public image endpoint

**Objective:** ให้ catalog ส่ง URL รูป และให้ public route เสิร์ฟเฉพาะรูปของสินค้า ACTIVE

**Files:**
- Modify: `apps/api/src/main/java/com/plutoshop/api/catalog/Product.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/catalog/ProductRepository.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/catalog/ProductCatalogResponse.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/catalog/ProductCatalogService.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/ProductImageController.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/security/SecurityConfig.java`
- Test: `apps/api/src/test/java/com/plutoshop/api/ProductApiIntegrationTest.java`

**Steps:**
1. เพิ่ม getters สำหรับ metadata ใน `Product` และ repository query ที่หา active product จาก `image_key`
2. map `imageUrl` เป็น relative internal path เมื่อมี image key; ไม่มีรูปให้เป็น `null`
3. เพิ่ม `GET /api/v1/product-images/{imageKey}` ให้ query DB ก่อนเปิดไฟล์ ไม่เปิด path โดยตรง
4. กำหนด `Content-Type` จาก metadata ที่ผ่าน allowlist, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` และ cache policy ที่ไม่ทำให้ replacement แสดงรูปเก่า
5. เพิ่ม security matcher สำหรับ public image route เท่านั้น ไม่เปิด `/api/v1/admin/**`
6. ทดสอบ active image `200`, no image `404`, hidden/inactive `404`, missing file `404` และ response ไม่มี filesystem path/stack trace

### Task 5: เพิ่ม admin image service และ endpoint พร้อม optimistic lock

**Objective:** ให้ admin upload/replace/delete รูปและบันทึก audit โดยไม่ทำให้ DB กับไฟล์เสียหายเมื่อ operation ล้มเหลว

**Files:**
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/AdminProductImageService.java`
- Create: `apps/api/src/main/java/com/plutoshop/api/productimage/AdminProductImageController.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/admin/AdminProductResponse.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/admin/AdminProductService.java`
- Modify: `apps/api/src/main/java/com/plutoshop/api/error/ApiExceptionHandler.java`
- Modify: `apps/api/src/test/java/com/plutoshop/api/admin/AdminProductApiIntegrationTest.java`

**Transaction/lifecycle rules:**

1. อ่าน product และตรวจ `version` ก่อนเขียน
2. validate/เขียนไฟล์ใหม่ก่อน โดยยังคงไฟล์เก่าไว้
3. update metadata, `updated_at`, `updated_by`, `version = version + 1` และ audit `UPDATE` ใน transaction เดียว
4. register after-commit cleanup เพื่อลบไฟล์เก่า; ถ้า DB rollback ให้ลบไฟล์ใหม่และคงไฟล์เก่า
5. delete product ต้องอ่าน image key ก่อนเรียก hard-delete function และลบ media หลัง transaction สำเร็จ เพื่อไม่ให้รูปกลายเป็น orphan โดยตั้งใจ
6. ถ้าการลบไฟล์เก่าหลัง commit ล้มเหลว ให้ log เฉพาะ key/hash ที่ไม่อ่อนไหวและปล่อยให้ cleanup/reconciliation ภายหลัง ไม่ rollback การแก้ DB แบบครึ่งทาง
7. ใช้ action `UPDATE` ใน audit เดิม ไม่ขยาย action enum โดยไม่จำเป็น; changed fields ระบุ `image`
8. เพิ่ม sanitized errors สำหรับ unsupported type, invalid image, too large, no image, stale version และไม่ส่ง provider/path/stack trace กลับ client

เพิ่ม integration tests ว่า:

- admin upload/replace/delete สำเร็จและ version เพิ่ม
- stale version ไม่เปลี่ยน DB และไม่ทิ้งไฟล์ใหม่ที่ใช้งานไม่ได้
- replacement ไม่ลบไฟล์เก่าก่อน DB commit
- delete product เก็บ audit/order snapshot ตามเดิมและ cleanup image
- customer/anonymous ใช้ endpoint ไม่ได้

### Task 6: เพิ่ม Next.js BFF สำหรับ multipart โดยไม่ทำให้ bytes เสีย

**Objective:** forward upload จาก browser ไป API ด้วย server token และคง multipart boundary/bytes เดิม

**Files:**
- Create: `apps/web/lib/admin-product-image-proxy.ts`
- Create: `apps/web/app/api/v1/admin/products/[id]/image/route.ts`
- Modify: `apps/web/lib/admin-products-proxy.ts` เฉพาะส่วนที่จำเป็นสำหรับ GET/DELETE image หรือคง helper แยกให้ชัด
- Modify: `apps/web/next.config.ts` ถ้าต้องเพิ่ม public image rewrite
- Test: `apps/web/tests/admin-product-image-proxy.test.ts`

**Security requirements:**

- ตรวจ `Origin` สำหรับ mutation เหมือน admin product proxy ปัจจุบัน
- ดึง bearer token จาก `getAccessToken()` ฝั่ง server เท่านั้น; ห้าม forward token ที่มาจาก browser
- validate numeric product id และ allowlist เฉพาะ `version` query
- ห้ามใช้ `request.text()` หรือ parse แล้ว reserialize multipart เพราะจะทำให้ binary/ boundary เปลี่ยน
- ใช้ bounded byte reader/array buffer ที่ตัดเกิน `6 MiB` และตั้ง `content-type` จาก request เดิมโดยไม่สร้าง boundary เอง
- GET admin image forward ได้เฉพาะ content headers ที่ปลอดภัย; ไม่ cache ข้ามผู้ดูแล
- ทดสอบ bytes, content type, no token exposure, foreign origin `403`, unauthenticated `401`, oversized body และ upstream `502`

### Task 7: ขยาย web API client และ strict schemas

**Objective:** ให้ TypeScript มี contract สำหรับ public image และ admin image mutation

**Files:**
- Modify: `apps/web/lib/products.ts`
- Modify: `apps/web/lib/admin-products.ts`
- Modify: `apps/web/tests/products-api.test.ts`
- Modify: `apps/web/tests/admin-products-api.test.ts`
- Modify: test fixtures ที่สร้าง `AdminProduct`/`Product`

**Steps:**
1. เพิ่ม `imageUrl: z.string().regex(/^\/api\/v1\/product-images\/[0-9a-f-]{36}$/u).nullable()` ใน public schema
2. เพิ่ม admin image metadata ใน `adminProductSchema` โดยใช้ `.strict()` ต่อไป
3. เพิ่ม `uploadAdminProductImage(id, file, version)` และ `deleteAdminProductImage(id, version)`
4. upload client ต้องส่ง `FormData`, append `file`, ใช้ `POST`, ส่ง version แบบ allowlisted query และไม่ตั้ง `content-type` เอง
5. แปลง non-2xx เป็น `AdminProductsApiError` พร้อม sanitized detail ตาม convention เดิม
6. ทดสอบว่า 204/JSON/error response ทำงานถูก และไม่ส่ง absolute local path หรือ filename ไปเป็น storage key

### Task 8: เพิ่มฟอร์มอัปโหลดในหน้า admin

**Objective:** ให้ admin เลือก preview เปลี่ยน และลบรูปจากฟอร์มสินค้าได้โดยไม่หลอกว่าการบันทึกสำเร็จเมื่อ upload ล้มเหลว

**Files:**
- Modify: `apps/web/components/admin-products-console.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/admin-products-console.test.tsx`

**UX/accessibility contract:**

- เพิ่ม `<input type="file" accept="image/png,image/jpeg">` พร้อม label ภาษาไทยที่ชัดเจน
- client-side type/size check เป็น UX เท่านั้น; backend ต้อง validate ซ้ำ
- แสดง current image ใน edit mode ผ่าน `/api/v1/admin/products/{id}/image` และ preview ใหม่ด้วย `URL.createObjectURL`; revoke object URL ทุกครั้งที่เปลี่ยน/ปิดฟอร์ม
- ปุ่มลบรูปต้องเป็นปุ่มที่มี accessible name และ confirmation ตามความเสี่ยง; ถ้าเลือกไฟล์ใหม่ให้ถือเป็น replacement ไม่เรียก delete ก่อน
- บันทึก metadata ก่อน แล้วใช้ response `id/version` ไป upload; สำหรับสินค้าใหม่ถ้า upload fail ให้แจ้งชัดเจนว่า metadata ถูกบันทึกแล้วแต่รูปยังไม่สำเร็จ พร้อมให้ retry ได้
- หลัง upload/delete สำเร็จ reload product เพื่อรับ version/metadata ล่าสุด
- คง keyboard focus, responsive layout และไม่ทำให้ form overflow ที่ 320/375/768/1280px

เพิ่ม tests:

- เลือก valid file แล้วเห็น preview
- invalid type/size ถูก reject ก่อน submit
- create/update เรียก upload ด้วย product id และ version ล่าสุด
- upload fail แสดง error เฉพาะเจาะจงและไม่แสดง success ปลอม
- remove image เรียก delete endpoint และ reload state
- tab/keyboard ใช้ file control และปุ่มได้

### Task 9: แสดงรูปจริงใน public catalog พร้อม fallback เดิม

**Objective:** รูปที่ admin upload แสดงบน card, option chooser, detail และ cart โดยสินค้าที่ไม่มีรูปยังใช้ deterministic art เดิม

**Files:**
- Modify: `apps/web/components/marketplace.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/marketplace-dialogs.test.tsx`
- Modify: `apps/web/e2e/marketplace.spec.ts`
- Optional test: `apps/web/e2e/admin-product-image.spec.ts` เมื่อมี authenticated admin fixture ที่ตรวจสอบได้

**Steps:**
1. ปรับ `ProductArt` ให้รับ `imageUrl` และ accessible alt; ถ้ามีรูป render รูป same-origin, ถ้าไม่มีให้ render art เดิม
2. ใช้ layout ที่กำหนด width/height หรือ `next/image` ให้ไม่เกิด layout shift/overflow; ห้ามใช้ external URL ที่ schema ไม่อนุญาต
3. card/detail/option/cart ต้องมี alt ที่เป็นชื่อสินค้าเมื่อเป็น meaningful image; fallback decorative art คง `aria-hidden`
4. เพิ่ม test ว่ารูปแสดงเมื่อ `imageUrl` มีค่า, fallback เมื่อ null และ URL ภายนอกถูก reject
5. เพิ่ม Playwright assertion ว่า image อยู่ใน card bounds, ไม่ทำให้ `scrollWidth > clientWidth`, และ fallback ยังทำงานกับ catalog seed เดิม
6. ก่อน E2E ต้อง rebuild/recreate web container เพื่อกัน stale standalone output

### Task 10: ผูก Docker volume และเขียนเอกสารการ backup/restore

**Objective:** ทำให้ไฟล์อยู่รอดหลัง recreate และทำให้ operator รู้ว่า DB backup กับ media backup ต้องทำคู่กัน

**Files:**
- Modify: `compose.yaml`
- Modify: `README.md`
- Modify: `apps/api/src/main/resources/application.yml`
- Modify: `apps/api/Dockerfile` เฉพาะเมื่อจำเป็นต้องสร้าง mount path/permission
- Test: `scripts/dev-compose.test.mjs` เฉพาะกรณีเพิ่ม config env ใหม่

**Steps:**
1. เพิ่ม named volume `product-media` และ mount เป็น `rw` เฉพาะ `api` ที่ `/var/lib/plutoshop/product-media`; คง API root filesystem เป็น `read_only`
2. ไม่ mount volume ให้ web, migrate, Keycloak หรือ database และไม่ publish media write port เพิ่ม
3. ตั้ง `PRODUCT_MEDIA_ROOT` และ multipart limits แบบไม่ใส่ secret ใน Git
4. ตรวจ user ใน API container เขียนได้เฉพาะ mount นี้; ห้ามแก้ด้วย `chmod 777`
5. README ระบุว่า `docker compose down` เก็บ media แต่ `down --volumes` ลบ DB และ media ทั้งหมด รวมถึงแนวทาง backup/restore ให้จับคู่ PostgreSQL dump กับ volume archive
6. ถ้าจะใช้ production/multi-instance ให้ระบุ migration path ไป S3/R2/MinIO และ private bucket/CDN แยกเป็นเฟสถัดไป

## Validation หลัง implementation

รันจาก root โดยไม่ใช้คำสั่งลบ volume และไม่เปิดเผย `.env`:

```bash
npm run test:root
npm run lint
npm run typecheck
npm test
npm run build
cd apps/api && ./mvnw --batch-mode --no-transfer-progress verify
cd ../..
docker compose config --quiet
bash -n infra/postgres/bootstrap-roles.sh
bash -n infra/postgres/init/010-create-readonly-role.sh
git diff --check
```

สำหรับ stack จริง:

```bash
npm run dev:docker -- --detach --wait
docker compose build api web
docker compose up -d --force-recreate migrate api web
curl -fsS http://127.0.0.1:3000/th >/dev/null
docker compose ps api web postgres
npm run test:catalog
npm run test:e2e
```

ตรวจเพิ่มเติมแบบไม่แสดง secret:

- upload ภาพ JPEG/PNG จริงผ่านหน้า admin แล้วอ่านกลับจาก public catalog
- เปลี่ยนรูปและยืนยัน URL/key ใหม่ทำให้ browser ไม่ใช้รูปเก่า
- เปลี่ยนสถานะสินค้าเป็น `HIDDEN` แล้ว public image ได้ `404` แต่ admin preview ยังได้เมื่อ login
- ลบรูปและยืนยัน response เป็น `404` พร้อม metadata ใน DB เป็น null
- ตรวจไฟล์ใน volume ว่าไม่มี temp/orphan จาก happy path; หากมี cleanup failure ต้องมี log ที่ไม่เปิดเผย path ภายใน/credential
- ตรวจว่า `pluto_inspector` อ่าน metadata ได้แต่ไม่มีสิทธิ์เขียน และไม่มี migration ใดเพิ่มสิทธิ์เขียนให้ role นี้

## ความเสี่ยงและ trade-offs

1. **Filesystem volume เป็น single-node:** ถ้าเพิ่ม API หลาย replica ต้องย้ายไป object storage ก่อน ไม่ควรแชร์ local volume ข้าม node
2. **DB กับ filesystem ไม่มี transaction เดียวกัน:** ใช้ temp + atomic move + after-commit cleanup และมี reconciliation ภายหลัง แทนการลบไฟล์เก่าก่อน commit
3. **รูป public เป็นข้อมูลที่เปิดเผยได้:** public route อนุญาตเฉพาะสินค้า ACTIVE และตรวจ DB mapping ทุกครั้ง; hidden/inactive ไม่ควรเดา URL แล้วอ่านได้
4. **ImageIO ไม่รองรับทุก format:** เริ่ม JPEG/PNG เพื่อไม่เพิ่ม supply-chain risk; หากต้องการ WebP ให้ทำ dependency review และเพิ่ม decoder ที่บำรุงรักษาได้ก่อน
5. **ภาพขนาดใหญ่เป็น DoS vector:** จำกัด request bytes, dimensions และ pixel count ทั้ง BFF และ API โดย API เป็น source of truth
6. **Cache replacement:** ใช้ opaque key ใหม่ทุก replacement และกำหนด cache headers ให้สอดคล้อง จึงไม่ควรนำ key เดิมกลับมาใช้
7. **Scope creep:** อย่าเพิ่ม gallery, resize worker, CDN, S3 credential หรือ image editor ในเฟสนี้จนกว่าจะยืนยัน requirement

## Open questions ก่อนเริ่ม implementation

- ต้องการเพียงรูปปก 1 รูปต่อสินค้าตามแผนนี้ หรือจำเป็นต้องมีหลายรูป/รูปต่อ option ตั้งแต่แรก
- จะรับเฉพาะ JPEG/PNG ตามแผน หรือมี requirement WebP ที่ต้องเตรียม decoder
- ระบบจะยัง local/Docker-only ต่อไปก่อนหรือมี production/multi-instance ใกล้ ๆ นี้ หาก production ใกล้ ควรขยับไป S3-compatible ตั้งแต่เฟสแรกแทน named volume
- ต้องการ resize/thumbnail หรือไม่; ค่าเริ่มต้นคือเก็บ original ที่ผ่าน validation และให้ CSS/Next image จัดการการแสดงผล

## สรุปผลที่ควรได้

เมื่อจบแผนนี้ admin จะอัปโหลดรูปผ่าน `/admin` ได้โดยไม่เปิด token และไม่เขียนไฟล์ลง container layer, catalog จะแสดงรูปจริงหรือ fallback ได้, product status/authorization ยังคุม public visibility, replacement/delete ไม่ทำให้ข้อมูล DB กับไฟล์เสียหายแบบเงียบ ๆ และ storage สามารถเปลี่ยนเป็น S3/R2 ในอนาคตผ่าน interface เดิม
