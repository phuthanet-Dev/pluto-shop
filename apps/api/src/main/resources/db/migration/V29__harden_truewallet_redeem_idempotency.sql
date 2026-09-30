-- เก็บเฉพาะลายนิ้วมือ HMAC ของลิงก์ TrueWallet เพื่อกันการส่ง voucher เดิมซ้ำ
-- ห้ามเพิ่มคอลัมน์ voucher_link แบบ plaintext เพราะลิงก์เป็นข้อมูลลับแบบใช้ครั้งเดียว
ALTER TABLE payment_transactions
    ADD COLUMN voucher_fingerprint BYTEA,
    ADD COLUMN redeem_started_at TIMESTAMPTZ;

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_voucher_fingerprint_length_check
    CHECK (voucher_fingerprint IS NULL OR octet_length(voucher_fingerprint) = 32);

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_truewallet_fingerprint_check
    CHECK (
        provider <> 'INWCLOUD_TRUEWALLET'
        OR voucher_fingerprint IS NOT NULL
    );

CREATE UNIQUE INDEX payment_transactions_truewallet_fingerprint_uq
    ON payment_transactions (voucher_fingerprint)
    WHERE provider = 'INWCLOUD_TRUEWALLET' AND voucher_fingerprint IS NOT NULL;

COMMENT ON COLUMN payment_transactions.voucher_fingerprint IS
    'ลายนิ้วมือ HMAC-SHA-256 ของ TrueWallet voucher_link; ไม่ใช่ลิงก์ต้นฉบับ';
COMMENT ON COLUMN payment_transactions.redeem_started_at IS
    'เวลาที่ระบบ claim การ redeem TrueWallet เพื่อป้องกันการเรียก provider ซ้ำ';
