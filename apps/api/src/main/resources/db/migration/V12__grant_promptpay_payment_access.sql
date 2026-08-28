-- Local and production Compose create pluto_user before Flyway runs. Testcontainers
-- does not, so this migration must remain safe in either environment.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO pluto_user';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE shop_orders TO pluto_user';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE shop_order_items TO pluto_user';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE payment_transactions TO pluto_user';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE shop_orders_id_seq, shop_order_items_id_seq, payment_transactions_id_seq TO pluto_user';
        EXECUTE 'GRANT EXECUTE ON FUNCTION reserve_product_stock(BIGINT, INTEGER) TO pluto_user';
        EXECUTE 'GRANT EXECUTE ON FUNCTION release_product_stock(BIGINT, INTEGER) TO pluto_user';
    END IF;
END
$migration$;
