DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user') THEN
        EXECUTE 'GRANT SELECT ON TABLE product_option_groups TO pluto_user';
    END IF;
END
$migration$;
