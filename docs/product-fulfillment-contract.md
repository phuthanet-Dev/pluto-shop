# Product Fulfillment Contract

สถานะ: ร่างสำหรับ implementation ระยะแรก

เอกสารนี้กำหนดขอบเขตของข้อมูลสินค้า inventory ลับ และการส่งมอบ โดยมีหลักว่า **ข้อมูลลับไม่ใช่ catalog data** และต้องไม่ถูกส่งผ่าน public product/order list

## 1. Ownership

| ขอบเขต | เจ้าของข้อมูล | หมายเหตุ |
|---|---|---|
| `products` | Catalog | ชื่อ ราคา stock projection `delivery_type` และข้อมูลที่แสดงต่อสาธารณะ; ห้ามมี password/license/invite token |
| `product_option_groups` | Multi-option group | shared card metadata เท่านั้น; ไม่เป็นเจ้าของ inventory |
| Fulfillment profile | Product/child | สินค้าที่ซื้อได้จริงหนึ่ง `product_id` กำหนด fulfillment type หลักหนึ่งชนิด |
| Digital inventory item | Product/child | secure item หนึ่งชุดต่อหนึ่งหน่วยสินค้า; payload เข้ารหัสทั้งก้อน |
| `shop_order_items` | Order snapshot | เก็บข้อมูลการซื้อที่ไม่ลับและ immutable; ห้ามคัดลอก secret ลง snapshot |
| Order fulfillment | Order item | reservation/allocation/status และ non-secret instruction snapshot |
| Fulfillment audit | Security/audit | เก็บ actor, entity id, action และ sanitized metadata; ห้ามเก็บ secret/request body |

Multi-option child ยังคงใช้ `product_id` เดิมใน cart, checkout และ order หาก child แต่ละตัวต้องการข้อมูลส่งมอบต่างกัน ให้กำหนด profile แยกต่อ child

## 2. Fulfillment type registry

สินค้าที่ซื้อได้จริงเลือก `fulfillment_type` จาก allowlist:

- `NONE`: สินค้าปกติ ไม่มี secure payload
- `DISCORD_ACCOUNT`: encrypted `{ schemaVersion, email, password }`
- `LICENSE_KEY`: encrypted `{ schemaVersion, licenseKey }`
- `INVITE_URL`: encrypted `{ schemaVersion, inviteUrl }`; URL ที่มี access token ถือเป็น secret
- `REDEEM_CODE`: encrypted `{ schemaVersion, code }`
- `MANUAL_INSTRUCTION`: ไม่มี credential payload; ใช้ delivery steps และ operator queue

แต่ละ type ต้องมี typed payload, validator และ delivery renderer/handler ของตัวเอง การพบ type หรือ schema version ที่ยังไม่รองรับต้อง reject หรือ quarantine อย่างปลอดภัย ห้ามรับ `Map<String,Object>` แบบ arbitrary เพื่อข้าม validation

ในรุ่นแรก inventory ของ SKU เดียวกันต้องใช้ type เดียวกับ product profile ห้ามผสมหลาย type ใน SKU เดียว หากต้องการขาย account กับ invite ให้แยกเป็นคนละ product/child ก่อน การรองรับ `MIXED` เป็นสัญญาใหม่ที่ต้องมี UI, state machine และ test แยกต่างหาก

## 3. Secret handling

- เก็บ payload ผ่าน application-layer AES-GCM ด้วย nonce แบบ CSPRNG ต่อ record
- ผูก authenticated data กับ `product_id`, `inventory_item_id`, `fulfillment_type` และ key version
- encryption key และ blind-index HMAC key ต้องแยกกัน
- key อ่านจาก environment/secret manager เท่านั้น; ห้าม commit ค่า secret จริง
- database เก็บ ciphertext, nonce และ key version; ไม่เก็บ email/password/license/code/invite token เป็น plaintext columns
- list/catalog/order snapshot ส่งเฉพาะ masked metadata และ status
- reveal ใช้ endpoint แยก ตรวจสิทธิ์ทุกครั้ง, audit, `Cache-Control: no-store`, ไม่ใส่ secret ใน URL/query/localStorage/log
- customer เห็นข้อมูลได้เฉพาะ order ของตนเองที่ `PAID` และ allocation `DELIVERED`

## 4. Stock and state

สำหรับ `NONE` ให้รักษา stock behavior เดิม

สำหรับ product ที่มี secure inventory:

- inventory `AVAILABLE` เป็น source of truth
- `products.stock_quantity` เป็น projection ที่ sync ใน transaction เดียวกัน
- admin ห้ามเขียน stock projection โดยตรงให้ขัดกับ inventory count
- checkout จอง inventory โดยไม่ decrypt secret

สถานะหลัก:

```text
Inventory: AVAILABLE -> RESERVED -> DELIVERED
Inventory: RESERVED -> AVAILABLE          (payment expired/failed/cancelled)
Inventory: AVAILABLE/RESERVED -> QUARANTINED/REVOKED

Fulfillment: PENDING -> RESERVED -> READY -> DELIVERED
Fulfillment: RESERVED -> RELEASED
Fulfillment: READY -> FAILED              (retryable)
Fulfillment: DELIVERED -> REVOKED
```

ทุก transition ต้อง conditional และ idempotent การส่งมอบล้มเหลวหลัง order เป็น `PAID` ต้องไม่เปลี่ยน payment state และต้อง retry ได้

สำหรับ `INSTANT` worker จะ claim แถว `READY` (รวม `RESERVED` ที่ค้างจากการเตรียมหลังชำระเงิน)
ด้วย row lock, ตรวจ decrypt ภายใน service boundary แล้วจึงเปลี่ยน allocation/inventory เป็น
`DELIVERED`; ข้อผิดพลาดจะถูกบันทึกเป็น `FAILED` พร้อม retry แบบจำกัดและ sanitized failure code
โดยไม่เก็บ payload ลับใน log/audit. ค่า `FULFILLMENT_DELIVERY_ENABLED` นอก Compose ปิดเป็นค่าเริ่มต้น
เพื่อ fail closed และต้องเปิดเฉพาะ deployment ที่ฉีด key ครบแล้ว

รุ่นแรกจำกัด secure-item product ที่ `quantity = 1` ต่อ cart line เพื่อไม่ให้การ assign หลายชุดกำกวม การรองรับ quantity มากกว่าหนึ่งต้องใช้ allocation ต่อ unit และมี contract/test เพิ่ม

## 5. Delivery steps

Delivery steps แยกจาก secret payload และ snapshot เมื่อ order พร้อมส่งมอบ:

- `CUSTOMER`: ขั้นตอนที่ลูกค้าต้องทำ
- `OPERATOR`: ขั้นตอนภายในสำหรับเจ้าหน้าที่
- มี Thai/English title/body และ optional HTTPS link
- `OPERATOR` steps ห้ามออกใน customer response
- การแก้ template ภายหลังไม่เปลี่ยน snapshot ของ order เดิม

## 6. Authorization

- Admin profile/inventory/steps/queue/reveal ใช้ `ROLE_ADMIN`
- Customer ใช้ authenticated issuer + subject และ object-level order ownership check
- ไม่ใช้ email เป็น authorization key
- Runtime DB role อ่าน catalog และทำเฉพาะ operation ที่ migration grant ไว้; admin DB role ใช้สำหรับ admin mutation

## 7. Business and legal gate

ก่อนเปิดใช้ `DISCORD_ACCOUNT` จริง ต้องยืนยันสิทธิ์ในการขาย/ส่งมอบบัญชีตาม Discord Terms และนโยบายข้อมูลส่วนบุคคล ทางเลือกที่ควรพิจารณาก่อนคือ invite, license, redeem code, entitlement หรือ OAuth handoff ที่ไม่ต้องเก็บ password

## 8. Non-goals

- ไม่เปลี่ยน payment state machine เดิม
- ไม่เก็บ access token, ID token, database credential หรือ provider secret ใน order/catalog
- ไม่ seed/delete/mutate ข้อมูลสินค้าจริงเพื่อทำให้ E2E ผ่าน
- ไม่แก้ migration V1-V25 ย้อนหลัง
- ไม่เพิ่ม dependency หาก JDK/Spring/โค้ดที่มีอยู่รองรับแล้ว
