# แผนรวม: เพิ่มความสามารถ Hermes บน Dev

แผนนี้เชื่อมงานสามส่วนที่ต้องทำตามลำดับ เพื่อให้ Hermes แก้โค้ด เข้าถึงข้อมูลร้านบน Dev และเปลี่ยนโครงสร้างฐานข้อมูลผ่าน migration ได้ โดยยังคง Production และระบบชำระเงินจริงไว้อย่างปลอดภัย

รายละเอียดเป็นรายการงานและคำสั่งทดสอบอยู่ในแผนย่อย:

- [ตรวจและแก้สิทธิ์ runtime ของ Hermes](2026-10-01-hermes-runtime-access.md)
- [เพิ่มสิทธิ์เข้าถึงฐานข้อมูลร้าน Dev](2026-10-01-hermes-dev-database-access.md)
- [วาง workflow สำหรับ schema migration](2026-10-01-hermes-dev-schema-migrations.md)

## ลำดับดำเนินงาน

1. **แก้ runtime ก่อน** — ตรวจ workspace, เครื่องมือแก้ไฟล์, terminal และ rootless Docker จาก Telegram session จริง แสดงผลตรวจเป็นชื่อรายการกับผ่าน/ไม่ผ่านเท่านั้น จากนั้นแก้เฉพาะสาเหตุที่พบ ห้ามทดลองเปิดหรือเชื่อมต่อ path และ socket ของ Production หรือ backup
2. **เปิดสิทธิ์ฐานข้อมูล Dev** — เพิ่มบัญชี `hermes_dev_operator` สำหรับตารางข้อมูลร้านทุกตารางใน `plutoshop_dev` ให้ทำ SELECT/INSERT/UPDATE/DELETE และใช้ sequence ได้ รวมถึงตารางใหม่ในอนาคต บัญชีนี้ไม่มีสิทธิ์เปลี่ยน schema หรือเข้าฐานข้อมูล Keycloak; credential อยู่ใน `.env.dev-server` และไม่แสดงใน log หรือแชต
3. **เปิดทางเปลี่ยน schema ผ่าน Flyway** — ทดสอบการเพิ่มและลบคอลัมน์และตารางกับ PostgreSQL ชั่วคราวใน Testcontainers เพิ่มการตรวจลำดับ deploy ว่า backup และการตรวจ restore ผ่านก่อน migration และบริการเดิมยังไม่ถูกแทนที่จน migration สำเร็จ
4. **ตรวจรับบน Dev** — ใช้ branch `hermes/*` และ deploy ด้วย workflow เดิมที่สร้าง backup เข้ารหัสนอกเครื่องก่อน migration ตรวจการเชื่อมต่อด้วย query ที่ไม่อ่านข้อมูลลูกค้า และยืนยันสุขภาพเว็บที่ `https://dev.phutoshop.com/th`

## ขอบเขตความปลอดภัยและการตรวจรับ

- ทำงานเรียงลำดับ ไม่แก้ runtime, Compose และ deploy workflow พร้อมกัน เพราะแผนเหล่านี้มีไฟล์ร่วมกัน
- ไม่ deploy หรือแก้ข้อมูล Production; ไม่เปิดฐานข้อมูลออกสู่อินเทอร์เน็ต; ไม่ให้ Hermes ใช้ sudo หรือ credential สำหรับ backup
- การทดสอบ DML และ schema ใช้ฐานข้อมูลชั่วคราว ไม่เปลี่ยน order, payment หรือ schema จริงเพื่อทำ probe
- Hermes เขียน DDL ได้เฉพาะ migration ที่ versioned และนำไปใช้ผ่าน `infra/dev/deploy.sh`; การเปลี่ยนที่ย้อนกลับไม่ได้ต้องให้เจ้าของตรวจ migration ก่อน
- หาก test, build, backup, restore verification หรือ migration ไม่ผ่าน ให้หยุดก่อนแทนที่ Dev services และคงข้อมูลจริงไว้เพื่อตรวจต่อ
- งานจบเมื่อ Telegram session ใช้เครื่องมือแก้โค้ดและ rootless Dev Docker ได้, role เข้าถึงเฉพาะข้อมูลร้าน Dev, migration workflow ผ่านการทดสอบ และ Production/backup paths ยังคงถูก systemd ปิดกั้น

## ลำดับแผนย่อย

ทำแผน runtime ก่อนแผนฐานข้อมูล แล้วจึงทำแผน schema migration แต่ละแผนมี test cycle และ commit ของตัวเอง ใช้ branch งาน `hermes/*`; ห้ามนำงานขึ้น `main` หรือ deploy Production
