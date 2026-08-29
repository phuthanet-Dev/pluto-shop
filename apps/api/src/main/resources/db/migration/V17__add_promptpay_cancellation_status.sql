-- เพิ่มสถานะยกเลิกสำหรับธุรกรรม PromptPay ที่ยังไม่สำเร็จ
ALTER TABLE shop_orders
    DROP CONSTRAINT IF EXISTS shop_orders_status_check;

ALTER TABLE shop_orders
    ADD CONSTRAINT shop_orders_status_check
    CHECK (status IN ('PAYMENT_PENDING', 'PAID', 'EXPIRED', 'FAILED', 'PAYMENT_REVIEW', 'CANCELLED'));

ALTER TABLE payment_transactions
    DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_status_check
    CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REVIEW', 'CANCELLED'));

COMMENT ON COLUMN shop_orders.status IS 'สถานะคำสั่งซื้อ: PAYMENT_PENDING, PAID, EXPIRED, FAILED, PAYMENT_REVIEW หรือ CANCELLED';
COMMENT ON COLUMN payment_transactions.status IS 'สถานะธุรกรรม: PENDING, PAID, EXPIRED, FAILED, REVIEW หรือ CANCELLED';
