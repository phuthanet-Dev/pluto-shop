# แบบออกแบบความสามารถของ Hermes บน Dev

## เป้าหมาย

ให้ Hermes Agent ที่รับงานจากเจ้าของผ่าน Telegram สามารถพัฒนา PlutoShop และ
จัดการฐานข้อมูล Dev ได้เพียงพอ โดยยังแยก Production และข้อมูลสำรองออกจากสิทธิ์
ของ agent อย่างชัดเจน Dev เปิดให้คนทั่วไปใช้และรับเงินจริง ข้อมูลจึงต้องคงอยู่
ระหว่างการพัฒนา และสถานะการชำระเงินต้องตรงกับผลยืนยันจากผู้ให้บริการ

## สภาพปัจจุบัน

- บัญชี Linux `hermes` เป็นเจ้าของโฟลเดอร์ `/srv/hermes/pluto-shop` และใช้
  Telegram gateway ที่จำกัดผู้ใช้ไว้แล้ว
- ค่าติดตั้งเลือก terminal backend แบบ `local`, กำหนด workspace เป็น
  `/srv/hermes/pluto-shop` และตั้ง `DOCKER_HOST` ให้ชี้ไปยัง rootless Docker
  socket ที่ `/run/user/<hermes-uid>/docker.sock`
- systemd user service จำกัดการเขียนของ Hermes ไว้ใน home และ runtime แบบ
  rootless พร้อมซ่อนโฟลเดอร์ Production, Docker socket ของ Production และ
  ข้อมูลรับรองสำหรับสำรองข้อมูลของผู้ดูแลระบบ
- ใน repository มี database role `pluto_inspector` สำหรับอ่านอย่างเดียว และ
  จำกัดคอลัมน์ข้อมูลสำคัญบางส่วนไว้ Hermes ยังไม่มี role สำหรับแก้ข้อมูล Dev
  ได้กว้าง
- `compose.dev-server.yaml` ถูกติดตามอยู่ที่ root ของ repository ส่วน
  `.env.dev-server` เป็นไฟล์ runtime ที่เก็บ secrets บน server และไม่มีใน
  checkout นี้ เมื่อลงมือจริงให้ตรวจไฟล์ runtime บน server โดยไม่คัดลอก secrets
  ลง Git, log หรือแชต
- ปัญหาที่พบคือ Hermes ทำงานกับ repository ได้น้อย และ session ใน Telegram
  ได้รับ `PermissionError` เมื่อพยายามเข้าถึง rootless Docker socket การมีค่า
  config ตามที่ตั้งใจไว้ยังบอกไม่ได้ว่าติดขัดที่ขอบเขต runtime ใด

## ขอบเขตที่อนุมัติ

Hermes ต้องสามารถทำสิ่งต่อไปนี้ได้:

1. อ่านและแก้ repository ที่ `/srv/hermes/pluto-shop` ใช้เครื่องมือพัฒนาและ
   ทดสอบ สร้าง commit บน branch งาน `hermes/*` สร้าง Dev images และ deploy
   ผ่าน `infra/dev/deploy.sh` เมื่อผ่านการตรวจที่กำหนด
2. อ่าน เพิ่ม แก้ไข และลบแถวในทุกตารางข้อมูลของร้านภายในฐานข้อมูล Dev
   `plutoshop_dev` รวมถึงตารางรถเข็น ออเดอร์ การชำระเงิน การส่งมอบ และคลัง
   รายการส่งมอบ เมื่อทำงานตามที่เจ้าของสั่ง ขอบเขตนี้รวมข้อมูลลูกค้าและ
   metadata การชำระเงินหรือการส่งมอบที่มีความอ่อนไหว ห้ามคัดลอกข้อมูลเหล่านี้
   ลง Git, log หรือ Telegram ตารางประวัติ migration ของ Flyway เป็น metadata
   ภายใน ไม่ใช่ตารางข้อมูลแอป และห้ามแก้โดยตรง
3. เปลี่ยน schema ของแอปบน Dev ได้ รวมถึงเพิ่มหรือลบคอลัมน์และตาราง โดยสร้าง
   Flyway migration แบบมีเวอร์ชันและนำไปใช้ผ่านขั้นตอน deploy ของ Dev

สิทธิ์นี้ไม่รวม Production, `/var/run/docker.sock`, sudo, ข้อมูลรับรองสำรอง
ข้อมูลของผู้ดูแลระบบ หรือฐานข้อมูลแยกของ Keycloak และไม่อนุญาตให้เปลี่ยนสถานะ
การชำระเงินฝั่งผู้ให้บริการ สร้างสถานะจ่ายสำเร็จปลอม หมุนกุญแจเข้ารหัสข้อมูล
fulfillment/payment รีเซ็ต persistent volumes ลบข้อมูล Dev จำนวนมาก หรือลบ
ประวัติออเดอร์/การชำระเงินจริง เว้นแต่เจ้าของสั่งชัดเจนและมี backup ที่ตรวจ
การกู้คืนแล้ว

## สถาปัตยกรรมที่เสนอ

### การรัน agent และการเข้าถึง repository

คง gateway บัญชีเดิมและ local terminal backend ไว้ แก้และตรวจเส้นทางการทำงาน
จริงจาก Telegram session แทนการสรุปว่า config ที่บันทึกไว้ถูกนำมาใช้แล้ว
session ต้องเริ่มที่ `/srv/hermes/pluto-shop` มองเห็นสถานะ branch และไฟล์ใน
Git ที่ถูกต้อง และสร้างกับลบไฟล์ชั่วคราวใน workspace ของตัวเองได้ ตรวจด้วยว่า
session ของเจ้าของที่ allowlist ไว้เรียกใช้ terminal, เครื่องมือแก้ไฟล์ และ
เครื่องมือรันโค้ดที่ Hermes รุ่นติดตั้งรองรับได้

ใช้เฉพาะ rootless Docker daemon สำหรับพัฒนาและ deploy Dev ตรวจ socket จาก
บริบทของ gateway ที่กำลังรัน โดยดู UID ที่ใช้จริง ค่า `DOCKER_HOST` ตำแหน่ง
และ permission ของ socket สุขภาพของ rootless Docker และการเข้าถึง Dev Compose
ห้ามแก้ปัญหาสิทธิ์ Dev ด้วยการเพิ่ม Hermes เข้า sudo หรือกลุ่ม `docker` ของ
Production และห้ามเปลี่ยนไปใช้ `/var/run/docker.sock`

### การเข้าถึงข้อมูล Dev

สร้าง database login role แยกสำหรับ Hermes ใน `plutoshop_dev` ให้สิทธิ์ระดับ
ตาราง `SELECT`, `INSERT`, `UPDATE` และ `DELETE` กับตารางข้อมูลแอปปัจจุบันทุก
ตาราง รวมถึงสิทธิ์ใช้ sequence ที่จำเป็น และตั้ง default privileges สำหรับ
ตารางกับ sequence ของแอปที่จะสร้างเพิ่ม ให้สิทธิ์ `CONNECT` กับฐานข้อมูล
`plutoshop_dev` และ `USAGE` บน application schema

role นี้ต้องไม่เป็น superuser, database owner, role administrator หรือ schema
owner และต้องไม่มีสิทธิ์ `CREATE`, `ALTER`, `DROP` หรือสิทธิ์ใด ๆ ในฐานข้อมูล
Keycloak คง role `pluto_inspector` แบบจำกัดสิทธิ์ไว้อย่างเดิมสำหรับเครื่องมือ
ตรวจสอบที่อ่านอย่างเดียว

PostgreSQL ให้สิทธิ์ `CONNECT` กับ `PUBLIC` เป็นค่าเริ่มต้นสำหรับฐานข้อมูลใหม่
ดังนั้นขั้นตอนตั้งค่าสิทธิ์เฉพาะ Dev ต้องถอน `CONNECT` และ `TEMPORARY` ที่สืบทอด
จาก `PUBLIC` บน `keycloak_dev` โดยคงสิทธิ์ของบัญชีบริการ Keycloak ไว้

ให้ PostgreSQL อยู่ในเครือข่ายภายในของ Dev Compose เท่านั้น ห้าม publish port
ออกสู่ public interface และห้ามเพิ่มเส้นทางฐานข้อมูลที่ใช้ host network ให้
เชื่อมต่อด้วย role เฉพาะผ่าน client path ของ Dev ซึ่งใช้ rootless runtime และ
ค่ารันระบบที่เก็บเป็นความลับ โดยไม่พิมพ์ credentials ออกมา ห้ามใช้ค่าเชื่อมต่อ
Production เป็นทางสำรอง

database role นี้เป็นการจำกัดสิทธิ์สำหรับการเชื่อมต่อฐานข้อมูลตามปกติ แต่ไม่ใช่
ขอบเขตความปลอดภัยที่ต้านโค้ดซึ่งควบคุม rootless Dev Docker ได้ กติกา migration
เป็นการควบคุมขั้นตอนทำงาน ขอบเขตความปลอดภัยจริงยังคงเป็นบัญชี Unix ของ Hermes
และ systemd ที่แยก Hermes ออกจาก Production และ backup credentials ของผู้ดูแล
การติดตั้งต้องตรวจว่าข้อจำกัดเหล่านี้ยังมีผลกับ gateway ที่กำลังทำงานอยู่
database account ที่มีสิทธิ์สูงกว่าจะใช้ได้เฉพาะใน migration service ที่ผ่าน
ขั้นตอน deploy ซึ่งมี guard เท่านั้น ห้ามใช้เป็นทางสำรองสำหรับแก้ข้อมูลทั่วไป

### การเปลี่ยน schema ของ Dev

Hermes เขียน migration ได้ทั้งการเพิ่มและการเปลี่ยนแปลง schema ที่ลบข้อมูลได้
แต่ต้องนำ migration ไปใช้ผ่าน Flyway และ `infra/dev/deploy.sh` ที่อยู่ใน
repository ห้ามสั่ง DDL โดยตรงกับฐานข้อมูลที่กำลังให้บริการ ทดสอบ migration
กับฐานข้อมูลทดสอบชั่วคราวก่อน และต้องรองรับแอปรุ่นที่กำลังทำงานอยู่ระหว่าง
เปลี่ยนผ่าน รวมถึงผ่านขั้นตอนสำรองข้อมูลเข้ารหัสนอกเครื่องและตรวจการกู้คืนก่อน
migration ตามระบบปัจจุบัน

การลบคอลัมน์/ตารางหรือแปลงข้อมูลแบบย้อนกลับไม่ได้ควรใช้ขั้นตอน
`expand-and-contract` เมื่อทำได้ Hermes ต้องแสดง migration และผลกระทบให้เจ้าของตรวจทานก่อน
นำการเปลี่ยนที่ย้อนกลับไม่ได้ไปใช้ ตาม `infra/dev/HERMES.md` หาก migration
ล้มเหลวให้หยุดอัปเดต ไม่มีการ rollback ฐานข้อมูลอัตโนมัติ แอปรุ่นก่อนหน้าและ
ข้อมูล Dev ทั้งหมดต้องยังอยู่เพื่อให้แก้ปัญหาต่อได้

### ขั้นตอนทำงานและจัดการข้อมูล

สำหรับงานที่เจ้าของสั่ง Hermes ใช้ branch `hermes/*` ตรวจโค้ดและแถวข้อมูล Dev
ที่เกี่ยวข้อง ทำการเปลี่ยนแปลง และรัน lint, type checks และ tests ที่เกี่ยวข้อง
commit เฉพาะไฟล์โค้ดและ migration ที่ตั้งใจแก้ ก่อน deploy ให้สร้าง image ที่
ติด SHA ขอและตรวจผล backup เข้ารหัสนอกเครื่อง ใช้ migration เริ่มบริการ Dev
ตรวจสุขภาพและ storefront จากนั้นรายงาน commit ผลตรวจ และ URL Dev ผ่านบทสนทนา
Telegram เดิม

สิทธิ์แก้ข้อมูลครอบคลุมตารางของร้านใน Dev แต่การแก้แต่ละครั้งต้องอยู่ในขอบเขต
ของงานที่ได้รับมอบหมาย รักษาแถวอื่นและออเดอร์จริง ห้าม reset ข้อมูลจำนวนมาก
และห้ามเปลี่ยนสถานะจ่ายสำเร็จโดยไม่มีการยืนยันจากผู้ให้บริการ การลบหรือเขียน
ทับประวัติออเดอร์/การชำระเงินต้องมีคำสั่งชัดเจนจากเจ้าของและ backup ที่ตรวจ
แล้ว หากข้อมูลที่ขอให้แก้ขัดกับผลจริงจากผู้ให้บริการหรือประวัติ fulfillment
Hermes ต้องรายงานก่อน ห้ามเขียนทับโดยพลการ

## การจัดการเมื่อผิดพลาด

- ถ้า workspace, terminal tools หรือ rootless Docker socket ยังไม่ผ่านการตรวจ
  ให้ Dev รุ่นปัจจุบันทำงานต่อและรายงานจุดที่ตรวจไม่ผ่าน ห้ามเปลี่ยนไปใช้
  Production
- ถ้า role หรือการเชื่อมต่อฐานข้อมูลไม่ผ่าน ห้ามเปิด PostgreSQL สู่ public
  network และห้ามใช้บัญชีที่มีสิทธิ์สูงกว่าเป็นทางแก้ขัด
- ห้ามใส่ Dev database, SMTP หรือ payment credentials ใน commit, ข้อความ
  Telegram หรือ build/deploy logs และห้ามพิมพ์ runtime environment files
- หาก tests, build, config validation, backup หรือ restore verification ล้มเหลว
  ให้หยุดก่อน deploy และ migration
- หาก migration ล้มเหลว ให้หยุด deploy เพื่อตรวจสอบ ห้าม restore ฐานข้อมูล Dev
  อัตโนมัติหรือทิ้งออเดอร์ที่เกิดหลัง backup
- Production ต้องคงอยู่ในสถานะพักและควบคุมการเปิดระบบด้วยขั้นตอนผู้ดูแล

## เกณฑ์ตรวจรับ

1. บัญชี Telegram ที่ไม่ได้รับอนุญาตยังใช้ gateway ไม่ได้ ส่วนบัญชีเจ้าของที่
   allowlist ไว้เรียกใช้ terminal, file และ code tools ได้
2. จาก Telegram session Hermes ตรวจและแก้ repository บน branch `hermes/*` รัน
   test ที่เกี่ยวข้อง และ commit การเปลี่ยนโค้ดได้
3. จากบริบทเดียวกัน rootless Docker ยืนยันโหมด rootless ได้ Hermes ใช้ build/
   test และ Dev Compose ได้ ส่วน Docker daemon และไฟล์ Production ยังเข้าไม่ถึง
4. database login เฉพาะอ่านและทำ DML ได้กับตารางข้อมูลแอปทุกตารางใน
   `plutoshop_dev` รวมทั้งตารางที่จะเพิ่มในอนาคต แต่ทำ DDL หรือจัดการ roles
   ไม่ได้ เชื่อมต่อ Keycloak หรือ Production ไม่ได้
5. Hermes เขียน migration ทั้งแบบเพิ่มและลบ schema ได้ ตรวจ migration กับ
   disposable database และนำ migration ที่เจ้าของสั่งไปใช้กับ Dev หลังผ่าน
   backup gate เท่านั้น ห้ามเปลี่ยน schema จริงเพื่อทดสอบ permission เฉย ๆ
   เจ้าของต้องตรวจ migration ที่ย้อนกลับไม่ได้ก่อนนำไปใช้
6. Hermes เข้าไฟล์ Production, Production Docker socket และ backup credentials
   นอกเครื่องไม่ได้ และฐานข้อมูล Dev ไม่เปิดออกสู่อินเทอร์เน็ต
7. นโยบายเดิมยังคงเดิม ได้แก่ ห้ามสร้างผลจ่ายเงินสำเร็จปลอม ห้ามหมุน
   encryption keys ห้าม reset volumes ห้าม rollback ฐานข้อมูลอัตโนมัติ และห้าม
   deploy Production

## นอกขอบเขต

- เปลี่ยน Telegram credentials, allowlist เจ้าของ, model provider หรือการตั้งค่า
  APILL
- ให้ Hermes ใช้ sudo, Production Docker, ฐานข้อมูล Production, ฐานข้อมูล
  Keycloak หรือ backup credentials
- เปิด PostgreSQL สู่ public หรือสร้าง database endpoint สาธารณะใหม่
- เปิด Production กลับอัตโนมัติ หรือย้ายออเดอร์จาก Dev ไป Production
