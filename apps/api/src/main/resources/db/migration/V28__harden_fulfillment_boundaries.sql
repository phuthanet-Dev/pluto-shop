-- Released allocations are historical rows and must not reserve an inventory item again.
ALTER TABLE order_fulfillment_allocations
    DROP CONSTRAINT IF EXISTS order_fulfillment_allocations_inventory_uq;

CREATE UNIQUE INDEX order_fulfillment_allocations_active_inventory_uq
    ON order_fulfillment_allocations (inventory_item_id)
    WHERE status IN ('RESERVED', 'DELIVERED', 'REVOKED');

ALTER TABLE order_fulfillments
    ADD COLUMN next_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN order_fulfillments.next_attempt_at IS
    'เวลาที่ worker จะลองส่งมอบซ้ำ; NULL หมายถึงยังไม่ถึงคิวหรือครบจำนวน retry อัตโนมัติ';

-- Inventory rows are bound to the exact profile identity that defines their payload contract.
ALTER TABLE product_fulfillment_profiles
    ADD CONSTRAINT product_fulfillment_profiles_identity_uq
    UNIQUE (product_id, fulfillment_type, provider, payload_schema_version);

ALTER TABLE digital_inventory_items
    DROP CONSTRAINT IF EXISTS digital_inventory_items_product_type_fkey;

ALTER TABLE digital_inventory_items
    ADD CONSTRAINT digital_inventory_items_profile_identity_fkey
    FOREIGN KEY (product_id, fulfillment_type, provider, payload_schema_version)
    REFERENCES product_fulfillment_profiles (
        product_id, fulfillment_type, provider, payload_schema_version
    ) ON DELETE RESTRICT;

-- The runtime role may decrypt/release inventory, but must not create or rewrite secret rows.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'REVOKE INSERT, UPDATE ON TABLE digital_inventory_items FROM pluto_user';
        EXECUTE 'GRANT UPDATE (status, reserved_until, delivered_at, updated_at, version) ON TABLE digital_inventory_items TO pluto_user';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        EXECUTE 'REVOKE UPDATE ON TABLE digital_inventory_items FROM pluto_admin';
        EXECUTE 'GRANT UPDATE (status, reserved_until, delivered_at, updated_at, updated_by, version) ON TABLE digital_inventory_items TO pluto_admin';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector') THEN
        EXECUTE 'REVOKE ALL ON TABLE digital_inventory_items FROM pluto_inspector';
    END IF;
END
$migration$;

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector') THEN
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE SELECT ON TABLES FROM pluto_inspector',
            current_user);
    END IF;
END
$migration$;

ALTER TABLE fulfillment_audit_log
    ALTER COLUMN actor_subject SET DEFAULT 'SYSTEM';

CREATE OR REPLACE FUNCTION public.validate_order_fulfillment_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    expected_product_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.order_item_id IS DISTINCT FROM NEW.order_item_id
            OR OLD.product_id IS DISTINCT FROM NEW.product_id) THEN
        RAISE EXCEPTION 'fulfillment binding is immutable' USING ERRCODE = '23514';
    END IF;

    SELECT product_id
      INTO expected_product_id
      FROM shop_order_items
     WHERE id = NEW.order_item_id;
    IF NOT FOUND OR expected_product_id IS DISTINCT FROM NEW.product_id THEN
        RAISE EXCEPTION 'fulfillment binding is invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS order_fulfillments_binding_trg ON order_fulfillments;
CREATE TRIGGER order_fulfillments_binding_trg
    BEFORE INSERT OR UPDATE OF order_item_id, product_id
    ON order_fulfillments
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_order_fulfillment_binding();

CREATE OR REPLACE FUNCTION public.validate_fulfillment_allocation_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    fulfillment_product_id BIGINT;
    fulfillment_type_value VARCHAR(32);
    inventory_product_id BIGINT;
    inventory_type_value VARCHAR(32);
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.order_fulfillment_id IS DISTINCT FROM NEW.order_fulfillment_id
            OR OLD.inventory_item_id IS DISTINCT FROM NEW.inventory_item_id) THEN
        RAISE EXCEPTION 'allocation binding is immutable' USING ERRCODE = '23514';
    END IF;

    SELECT product_id, fulfillment_type
      INTO fulfillment_product_id, fulfillment_type_value
      FROM order_fulfillments
     WHERE id = NEW.order_fulfillment_id;
    SELECT product_id, fulfillment_type
      INTO inventory_product_id, inventory_type_value
      FROM digital_inventory_items
     WHERE id = NEW.inventory_item_id;
    IF NOT FOUND
       OR fulfillment_product_id IS DISTINCT FROM inventory_product_id
       OR fulfillment_type_value IS DISTINCT FROM inventory_type_value THEN
        RAISE EXCEPTION 'allocation binding is invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS order_fulfillment_allocations_binding_trg ON order_fulfillment_allocations;
CREATE TRIGGER order_fulfillment_allocations_binding_trg
    BEFORE INSERT OR UPDATE OF order_fulfillment_id, inventory_item_id
    ON order_fulfillment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_fulfillment_allocation_binding();

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'REVOKE INSERT, UPDATE ON TABLE order_fulfillments FROM pluto_user';
        EXECUTE 'GRANT INSERT (id, order_item_id, product_id, fulfillment_type, delivery_type, status, instructions_snapshot) ON TABLE order_fulfillments TO pluto_user';
        EXECUTE 'GRANT UPDATE (status, failure_code, retry_count, last_attempt_at, next_attempt_at, delivered_at, delivered_by, updated_at, version) ON TABLE order_fulfillments TO pluto_user';

        EXECUTE 'REVOKE INSERT, UPDATE ON TABLE order_fulfillment_allocations FROM pluto_user';
        EXECUTE 'GRANT INSERT (order_fulfillment_id, inventory_item_id, unit_index, status) ON TABLE order_fulfillment_allocations TO pluto_user';
        EXECUTE 'GRANT UPDATE (status, released_at, delivered_at, updated_at, version) ON TABLE order_fulfillment_allocations TO pluto_user';

        EXECUTE 'REVOKE INSERT ON TABLE fulfillment_audit_log FROM pluto_user';
        EXECUTE 'GRANT INSERT (product_id, order_fulfillment_id, inventory_item_id, action, actor_issuer, actor_subject, metadata_jsonb) ON TABLE fulfillment_audit_log TO pluto_user';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        EXECUTE 'REVOKE INSERT, UPDATE ON TABLE order_fulfillments FROM pluto_admin';
        EXECUTE 'GRANT UPDATE (status, failure_code, retry_count, last_attempt_at, next_attempt_at, delivered_at, delivered_by, updated_at, version) ON TABLE order_fulfillments TO pluto_admin';
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE order_fulfillment_allocations FROM pluto_admin';
        EXECUTE 'REVOKE INSERT ON TABLE fulfillment_audit_log FROM pluto_admin';
        EXECUTE 'GRANT INSERT (product_id, order_fulfillment_id, inventory_item_id, action, actor_issuer, actor_subject, metadata_jsonb) ON TABLE fulfillment_audit_log TO pluto_admin';
    END IF;
END
$migration$;

REVOKE ALL ON FUNCTION public.validate_order_fulfillment_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_fulfillment_allocation_binding() FROM PUBLIC;
DO $function_privileges$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_order_fulfillment_binding() TO pluto_user';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_fulfillment_allocation_binding() TO pluto_user';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_order_fulfillment_binding() TO pluto_admin';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_fulfillment_allocation_binding() TO pluto_admin';
    END IF;
END
$function_privileges$;

CREATE OR REPLACE FUNCTION public.delete_product_and_carts(
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
    IF p_product_id IS NULL OR p_version IS NULL THEN
        RETURN 'INVALID_ARGUMENT';
    END IF;

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

    IF EXISTS (
        SELECT 1 FROM product_fulfillment_profiles WHERE product_id = p_product_id
    ) OR EXISTS (
        SELECT 1 FROM digital_inventory_items WHERE product_id = p_product_id
    ) OR EXISTS (
        SELECT 1
          FROM order_fulfillments
         WHERE order_fulfillments.product_id = p_product_id
    ) THEN
        RETURN 'FULFILLMENT_CONFLICT';
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
