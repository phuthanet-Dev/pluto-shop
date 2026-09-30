-- ป้องกันไม่ให้บทบาท inspector อ่าน HMAC fingerprint ของ TrueWallet
-- ยังคงให้ inspector อ่านข้อมูลสถานะ payment ที่ไม่ใช่ข้อมูลลับได้
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector') THEN
        REVOKE ALL PRIVILEGES ON payment_transactions FROM pluto_inspector;
        GRANT SELECT (
            id,
            order_id,
            provider,
            transaction_id,
            status,
            amount_minor,
            qr_url,
            payload,
            expires_at,
            checked_at,
            created_at,
            updated_at,
            provider_amount_minor,
            redeem_started_at
        ) ON payment_transactions TO pluto_inspector;
    END IF;
END
$migration$;
