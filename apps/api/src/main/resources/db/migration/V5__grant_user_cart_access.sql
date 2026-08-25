DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO pluto_user';
        EXECUTE 'GRANT SELECT ON TABLE products TO pluto_user';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_users, carts, cart_items TO pluto_user';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE app_users_id_seq, carts_id_seq, cart_items_id_seq TO pluto_user';
    END IF;
END
$migration$;
