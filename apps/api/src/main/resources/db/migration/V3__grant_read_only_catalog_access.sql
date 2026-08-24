-- Local and production Compose create pluto_app before Flyway runs. Testcontainers
-- does not, so this migration must remain safe in either environment.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_app') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO pluto_app';
        EXECUTE 'GRANT SELECT ON TABLE products TO pluto_app';
    END IF;
END
$migration$;
