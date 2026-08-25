-- Re-apply catalog grants for volumes where V8 ran before pluto_admin existed.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE products TO pluto_admin';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE products_id_seq TO pluto_admin';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE product_audit_log TO pluto_admin';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE product_audit_log_id_seq TO pluto_admin';
    END IF;
END
$migration$;
