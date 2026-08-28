ALTER TABLE shop_orders
    DROP CONSTRAINT IF EXISTS shop_orders_status_check;

ALTER TABLE shop_orders
    ADD CONSTRAINT shop_orders_status_check
    CHECK (status IN ('PAYMENT_PENDING', 'PAID', 'EXPIRED', 'FAILED', 'PAYMENT_REVIEW'));

ALTER TABLE shop_orders
    DROP CONSTRAINT IF EXISTS shop_orders_payment_method_check;

ALTER TABLE shop_orders
    ADD CONSTRAINT shop_orders_payment_method_check
    CHECK (payment_method IN ('PROMPTPAY', 'TRUEWALLET'));

ALTER TABLE payment_transactions
    DROP CONSTRAINT IF EXISTS payment_transactions_provider_check;

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_provider_check
    CHECK (provider IN ('INWCLOUD', 'INWCLOUD_TRUEWALLET'));

ALTER TABLE payment_transactions
    DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_status_check
    CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REVIEW'));

ALTER TABLE payment_transactions
    ADD COLUMN provider_amount_minor BIGINT;

ALTER TABLE payment_transactions
    ADD CONSTRAINT payment_transactions_provider_amount_check
    CHECK (provider_amount_minor IS NULL OR provider_amount_minor > 0);
