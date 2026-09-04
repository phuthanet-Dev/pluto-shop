-- Keep GUI inspection read-only and separate from application/admin roles.
-- Testcontainers can run without the local inspector role, so this migration is conditional.
DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector') THEN
        ALTER ROLE pluto_inspector NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
        REVOKE CREATE ON SCHEMA public FROM pluto_inspector;
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO pluto_inspector', current_database());
        GRANT USAGE ON SCHEMA public TO pluto_inspector;
        REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM pluto_inspector;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO pluto_inspector;
        REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM pluto_inspector;
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM pluto_inspector',
            current_user
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO pluto_inspector',
            current_user
        );
    END IF;
END
$migration$;
