# Fulfillment secret-key runbook

## Scope

`digital_inventory_items.secret_ciphertext` ใช้ AES-GCM และ `secret_fingerprint` ใช้ HMAC blind index ตาม key material ที่ฉีดผ่าน environment เท่านั้น

ห้ามใส่ key ลงใน Git, Dockerfile, Compose ที่ commit ค่าไว้, log, issue, screenshot หรือคำสั่ง shell ที่อาจถูกบันทึก

## Initial local setup

`npm run dev:docker` จะเพิ่มค่าต่อไปนี้ลงใน `.env` ที่ local-only ถ้ายังไม่มี:

- `FULFILLMENT_SECURITY_ENCRYPTION_KEY_BASE64`
- `FULFILLMENT_SECURITY_FINGERPRINT_KEY_BASE64`
- `FULFILLMENT_SECURITY_KEY_VERSION=1`

ตั้ง `FULFILLMENT_DELIVERY_ENABLED=true` เฉพาะ API ที่มี key ทั้งสองครบและพร้อมให้ worker
ส่งมอบ instant fulfillment; ค่าเริ่มต้นนอก Compose เป็น `false` เพื่อไม่ให้ worker เปลี่ยนสถานะ
ข้อมูลเมื่อ deployment ยังไม่มี key

ค่าทั้งสองต้องเป็น base64url ของ random 32 bytes และต้องไม่เท่ากัน

ระหว่าง rolling rotation ให้ประกาศ key ring เป็นรายการ `version:base64url` คั่นด้วย `;`
เช่น `1:OLD_KEY;2:NEW_KEY` ใน `FULFILLMENT_SECURITY_ENCRYPTION_KEY_RING` และรูปแบบเดียวกัน
ใน `FULFILLMENT_SECURITY_FINGERPRINT_KEY_RING` โดย `FULFILLMENT_SECURITY_KEY_VERSION` ต้องชี้
ไปยัง version ใหม่ที่มีอยู่ในทั้งสอง ring; ห้ามใส่ค่า key จริงในเอกสารหรือ shell history

## Rotation procedure

1. สร้าง encryption key และ fingerprint key ใหม่ด้วย secret manager/CSPRNG; ห้ามพิมพ์ค่าออก stdout
2. เตรียม application ให้รองรับ key version เก่าและใหม่พร้อมกันสำหรับ decrypt ระหว่าง migration
3. ตั้ง `FULFILLMENT_SECURITY_KEY_VERSION` เป็น version ใหม่สำหรับ record ที่เขียนใหม่
4. deploy/restart API แบบ rolling ตามลำดับที่ระบบรองรับ
5. re-encrypt inventory ทีละ batch ภายใน transaction:
   - lock เฉพาะ row ที่กำลังทำ
   - decrypt ด้วย `encryption_key_version` เดิม
   - validate payload กับ `payload_schema_version` เดิม
   - encrypt ด้วย key version ใหม่และ AAD เดิม
   - update ciphertext, nonce และ key version โดยไม่เปลี่ยน fingerprint หากใช้ fingerprint key เดิม
   - ไม่เขียน plaintext หรือ provider response ลง audit/log
6. ตรวจจำนวน row ต่อ key version และสุ่ม decrypt ผ่าน service ที่มี authorization เท่านั้น
7. เก็บ key เก่าแบบ read-only ตาม retention policy จนไม่มี row ใช้งาน แล้วจึง revoke/destroy ผ่าน secret manager

## Failure handling

- key หาย, key version ไม่รู้จัก, GCM tag ไม่ผ่าน หรือ payload validation ไม่ผ่าน ต้อง fail closed
- ห้าม fallback ไป plaintext, key ค่าเริ่มต้น หรือ decrypt แบบไม่ตรวจ AAD/fingerprint
- mark operation เป็น sanitized failure และเก็บเฉพาะ entity ID/status ที่ไม่ลับ
- ห้ามเปลี่ยน payment status เป็น unpaid เพราะการ decrypt/delivery ล้มเหลว; order ที่ `PAID` ต้อง retry fulfillment ได้
- ห้ามลบ ciphertext เพื่อแก้ปัญหา และห้ามใช้ Flyway repair เพื่อซ่อน schema checksum

## Access review

- runtime `pluto_user` ใช้ allocation/customer reveal ตาม object ownership
- `pluto_admin` ใช้ admin import/reveal/revoke ตาม `ROLE_ADMIN`
- `pluto_inspector` ไม่มีสิทธิ์อ่าน `digital_inventory_items`
- customer response ใช้ `Cache-Control: no-store` และไม่ส่ง key metadata/ciphertext/nonce
- audit เก็บ action/entity/actor/metadata ที่ sanitize แล้วเท่านั้น

## Verification checklist

- [ ] key อยู่ใน secret manager/environment นอก repository
- [ ] current/old key version ถูกประกาศและทดสอบใน isolated database
- [ ] re-encryption batch มี row lock และตรวจ GCM/AAD/fingerprint
- [ ] decrypt failure ไม่เปิดเผยข้อมูลและไม่เปลี่ยน payment state
- [ ] inventory list/catalog/order snapshot ไม่มี secret
- [ ] access review และ audit query ไม่คืน payload ลับ
- [ ] backup/restore policy ครอบคลุม key material และ ciphertext พร้อมกัน
