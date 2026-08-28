ALTER TABLE cart_items
    DROP CONSTRAINT IF EXISTS cart_items_product_id_fkey;

ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE shop_order_items
    ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE shop_order_items
    DROP CONSTRAINT IF EXISTS shop_order_items_product_id_fkey;

ALTER TABLE shop_order_items
    ADD CONSTRAINT shop_order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE product_audit_log
    ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE product_audit_log
    DROP CONSTRAINT IF EXISTS product_audit_log_product_id_fkey;

ALTER TABLE product_audit_log
    ADD CONSTRAINT product_audit_log_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE product_audit_log
    DROP CONSTRAINT IF EXISTS product_audit_log_action_check;

ALTER TABLE product_audit_log
    ADD CONSTRAINT product_audit_log_action_check
    CHECK (action IN ('CREATE', 'UPDATE', 'STOCK', 'ARCHIVE', 'DELETE'));

COMMENT ON COLUMN product_audit_log.product_id IS
    'รหัสสินค้าที่ถูกเปลี่ยนแปลง; เป็น NULL หลัง hard delete แต่ snapshot อยู่ใน changed_fields';
COMMENT ON COLUMN shop_order_items.product_id IS
    'รหัสสินค้าเดิม; เป็น NULL หลัง hard delete โดยเก็บ product snapshot ในแถวคำสั่งซื้อ';

CREATE OR REPLACE FUNCTION delete_product_and_carts(
    p_product_id BIGINT,
    p_version BIGINT,
    p_actor_issuer VARCHAR,
    p_actor_subject VARCHAR
)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    current_slug VARCHAR(120);
    current_name_th VARCHAR(180);
    current_name_en VARCHAR(180);
    current_version BIGINT;
BEGIN
    SELECT slug, name_th, name_en, version
      INTO current_slug, current_name_th, current_name_en, current_version
      FROM products
     WHERE id = p_product_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'NOT_FOUND';
    END IF;

    IF current_version <> p_version THEN
        RETURN 'VERSION_CONFLICT';
    END IF;

    INSERT INTO product_audit_log (
        product_id, action, actor_issuer, actor_subject, changed_fields
    ) VALUES (
        p_product_id,
        'DELETE',
        p_actor_issuer,
        p_actor_subject,
        jsonb_build_object(
            'slug', current_slug,
            'nameTh', current_name_th,
            'nameEn', current_name_en,
            'version', current_version
        )
    );

    DELETE FROM cart_items WHERE product_id = p_product_id;
    DELETE FROM products WHERE id = p_product_id AND version = p_version;

    IF NOT FOUND THEN
        RETURN 'VERSION_CONFLICT';
    END IF;

    RETURN 'DELETED';
END
$function$;

REVOKE ALL ON FUNCTION delete_product_and_carts(BIGINT, BIGINT, VARCHAR, VARCHAR) FROM PUBLIC;

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        REVOKE CREATE ON SCHEMA public FROM pluto_admin;
        EXECUTE 'GRANT EXECUTE ON FUNCTION delete_product_and_carts(BIGINT, BIGINT, VARCHAR, VARCHAR) TO pluto_admin';
    END IF;
END
$migration$;
