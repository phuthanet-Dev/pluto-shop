# PlutoShop Production Runbook

เอกสารนี้เป็น runbook สำหรับการนำ PlutoShop ขึ้น VPS จริง โดยแยกจาก `compose.yaml` ที่ใช้พัฒนาในเครื่อง

## ภาพรวม

```text
Internet
   │ 80/443
   ▼
Caddy container
   ├── shop.<domain> ──> web container ──private──> api container
   └── auth.<domain> ──> Keycloak container
                                      │
                                      └──private──> PostgreSQL
```

- ผู้ใช้เข้าผ่าน `shop.<domain>` เท่านั้น; browser ใช้ same-origin Next.js BFF ต่อไปยัง API
- `auth.<domain>` เปิดเฉพาะ endpoint ที่จำเป็นสำหรับ realm `pluto`; Caddy block Keycloak admin/master/metrics/health routes
- PostgreSQL, API และ Keycloak ไม่มี `ports` ออก host; production เปิดจาก Compose เฉพาะ 80/443 ให้ Caddy
- Keycloak ใช้ PostgreSQL instance เดียวกับแอป แต่ใช้ database และ role แยก
- ฐานข้อมูล production เป็นฐานใหม่จาก Flyway/seed; ไม่ย้าย user, cart, order หรือ payment จาก local

## สิ่งที่ต้องมี

1. VPS Linux 6 vCPU / RAM 12 GB พร้อม Docker Engine และ Docker Compose v2
2. DNS `A/AAAA` ของ `shop.<domain>` และ `auth.<domain>` ชี้ไป VPS เดียวกัน
3. เปิด firewall ภายนอกเฉพาะ SSH จากแหล่งที่ไว้ใจ, TCP 80 และ TCP 443
4. SMTP provider ที่ port 587 หรือ 465
5. S3-compatible bucket สำหรับ Restic
6. URL สำหรับแจ้งเตือน และ dead-man URL สำหรับแจ้งว่า backup สำเร็จ
7. GitHub Container Registry ที่เครื่อง VPS pull ได้ด้วย token แบบ read-only package
8. เปิด unattended security upgrades และ SSH key-only access ก่อนเปิดบริการสาธารณะ

ไม่ควรเปิด `5432`, `3000`, `8080` หรือ `8081` ออก Internet แม้จะมี UFW; ใช้กฎ DOCKER-USER/nftables เพิ่มเพื่อกัน Docker bypass firewall และตรวจด้วย external port scan

## เตรียม repository บน VPS

ใช้ deploy user แยก เช่น `pluto` และวาง checkout ไว้ที่:

```text
/opt/pluto-shop/current
```

คัดลอก `.env.production.example` เป็น `.env.production` แล้วกรอกค่าจริง เก็บไฟล์ด้วย permission `600` และอย่า commit กลับเข้า Git

สคริปต์จะสร้าง `infra/production/runtime` เป็น directory permission `700`; ไฟล์ realm ที่มี SMTP secret อยู่ใน directory นี้และไม่ถูกเก็บใน Git

ค่าที่ต้องตรวจเป็นพิเศษ:

- `SHOP_DOMAIN`, `AUTH_DOMAIN`, `ACME_EMAIL`
- `IMAGE_NAMESPACE=ghcr.io/<owner>/pluto-shop`
- `IMAGE_TAG` ต้องเป็น Git commit SHA 40 ตัว
- PostgreSQL owner/write/admin/inspector และ Keycloak database/admin secrets ต้องไม่ซ้ำกัน
- `AUTH_SESSION_SECRET` และ fulfillment encryption/fingerprint keys ต้องเก็บสำรองไว้อย่างปลอดภัย
- `KEYCLOAK_REALM_FILE=./infra/production/runtime/realm-production.json`
- SMTP และ `INWCLOUD_API_KEY`
- Restic repository/password/S3 credentials

เก็บ recovery secrets อย่างน้อยสองสถานที่ที่แยกกัน และจำลองการกู้คืนจริงตามรอบที่กำหนด ไม่ถือว่า “มี backup” เพียงเพราะมีไฟล์อยู่ใน bucket

สร้าง Restic repository ครั้งเดียวหลังตั้งค่า S3 และ `RESTIC_PASSWORD` แล้วด้วย `restic init`; หลังจากนั้นห้ามเปลี่ยน repository/password โดยไม่มีแผน recovery ที่ทดสอบแล้ว

## Deploy ครั้งแรกและ deploy ปกติ

ก่อนให้ Hermes ได้ GitHub credential ต้องเปิด branch protection ของ `main` ก่อน โดย require CI และ review; Hermes ใช้เฉพาะ `hermes/*` branches และห้าม merge/deploy เอง

GitHub Actions จะตรวจ lint, typecheck, unit, API integration, Compose และ Playwright E2E ก่อน จากนั้นเมื่อ push `main` จะ build และ push image สามตัวด้วย tag เป็น commit SHA:

```text
ghcr.io/<owner>/pluto-shop-web:<sha>
ghcr.io/<owner>/pluto-shop-api:<sha>
ghcr.io/<owner>/pluto-shop-keycloak:<sha>
```

การ deploy บน VPS เป็น manual:

```bash
cd /opt/pluto-shop/current
git pull --ff-only origin main
IMAGE_TAG=<40-character-commit-sha> \
  ENV_FILE=/opt/pluto-shop/current/.env.production \
  bash ./infra/production/deploy-production.sh
```

สคริปต์จะ render realm production, validate Compose, pull image ที่ระบุ, สร้าง role/database ที่จำเป็น, ทำ online pre-migration backup, รัน Flyway, start stack และตรวจ HTTPS จากภายนอก

การ rollback image ทำได้โดยตั้ง `IMAGE_TAG` เป็น SHA ก่อนหน้าแล้ว deploy ใหม่ แต่ห้ามย้อน database migration แบบเดาสุ่ม; ใช้ pre-migration backup และแผน restore ที่ผ่านการซ้อมแทน

## Backup และ restore verification

`backup-production.sh` ไม่หยุดทั้งระบบ โดยจะ:

1. ทำ `pg_dump -Fc` ของ `plutoshop` และ `keycloak` ผ่าน PostgreSQL container
2. กู้ dump ใน PostgreSQL ชั่วคราวที่จำกัด CPU/RAM เพื่ออ่าน manifest จาก dump เดียวกัน รองรับฐานว่างก่อน migration ครั้งแรก
3. copy product-media และ Caddy certificate state
4. ตรวจว่าไฟล์รูปที่ database อ้างถึงมีอยู่ใน snapshot
5. upload เป็น encrypted Restic snapshot
6. ใช้ retention daily 7, weekly 4, monthly 3

การ copy media หลัง online database dump อาจมีไฟล์ใหม่เกินกว่าที่ dump อ้างถึง ซึ่งยอมรับได้เพราะการเขียนไฟล์เป็น atomic; ถ้าพบไฟล์ที่ database อ้างถึงหาย สคริปต์จะ fail และแจ้งเตือน ไม่บันทึก snapshot ที่ไม่น่าเชื่อถือ

เปิด systemd timers:

```bash
sudo cp infra/production/systemd/pluto-shop-*.service /etc/systemd/system/
sudo cp infra/production/systemd/pluto-shop-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pluto-shop-backup.timer
sudo systemctl enable --now pluto-shop-health.timer
sudo systemctl enable --now pluto-shop-restore-check.timer
```

ก่อนทุก migration มี pre-migration backup อัตโนมัติจาก deploy script; full restore verification ทำรายเดือน โดย restore ไปยัง PostgreSQL ชั่วคราวที่ไม่มี network แล้วตรวจทั้งสอง database และ media manifest

ตรวจผล:

```bash
sudo systemctl status pluto-shop-backup.timer
sudo journalctl -u pluto-shop-backup.service --since today
sudo systemctl start pluto-shop-restore-check.service
```

## Monitoring และ acceptance

ต้องมี monitor ที่อยู่นอก VPS ตรวจอย่างน้อย:

- `https://shop.<domain>/th`
- `https://auth.<domain>/realms/pluto/.well-known/openid-configuration`

ตั้ง dead-man URL ให้ backup ping หลังสำเร็จ เพื่อให้รู้กรณี VPS ล่มจนไม่สามารถส่ง alert เองได้ ตั้ง alert webhook/Telegram สำหรับ deploy, backup, restore-check และ health failure

Acceptance จากเครือข่ายภายนอก VPS:

- HTTP redirect ไป HTTPS และ certificate ต่ออายุได้
- catalog, signup, email verification, login/logout และ cart ใช้งานได้
- admin login และ catalog/media/stock actions ใช้งานได้
- PromptPay flow ใช้ provider key จริงในโหมดที่อนุมัติ
- ค้นพบว่า `5432`, `3000`, `8080`, `8081` และ Keycloak admin/master routes จากภายนอกไม่ได้
- backup, restore verification และ external monitor ส่งผลตามที่คาด

## Hermes boundary

Hermes อยู่บน VPS เดียวกันแต่แยก Unix user และ workspace จาก production โดยให้ credential แบบ repo-only fine-grained หรือ GitHub App ที่ไม่มีสิทธิ์ admin, secrets, actions หรือ production server และไม่ให้ Docker socket, SSH key, `.env.production`, S3 credentials หรือ Keycloak admin credentials

บังคับ resource limit ของ Hermes host เช่น `CPUQuota=300%`, `MemoryMax=4G`, `TasksMax` และ systemd hardening (`ProtectSystem`, `ProtectHome`, `NoNewPrivileges`) การแก้ไขต้อง push เป็น `hermes/*` branch เพื่อ review; Hermes ไม่ merge และไม่ deploy

คำสั่งเริ่ม Hermes ยังไม่ถูกผูกไว้ใน repo เพราะต้องเลือก runtime/entrypoint ของ Hermes ให้แน่นอนก่อน จึงไม่สร้าง service ที่อาจรันผิดตัวบน production
