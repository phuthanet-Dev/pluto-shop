\set ON_ERROR_STOP on
\getenv operator_password POSTGRES_HERMES_PASSWORD

SELECT format('CREATE ROLE hermes_dev_operator LOGIN PASSWORD %L', :'operator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_dev_operator')
\gexec

ALTER ROLE hermes_dev_operator
    WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    PASSWORD :'operator_password';

REVOKE CONNECT, TEMPORARY ON DATABASE :"application_database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"application_database" TO hermes_dev_operator;

REVOKE CONNECT, TEMPORARY ON DATABASE :"keycloak_database" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"keycloak_database" TO :"keycloak_role";
REVOKE CONNECT, TEMPORARY ON DATABASE :"keycloak_database" FROM hermes_dev_operator;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hermes_dev_operator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hermes_dev_operator;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO hermes_dev_operator;

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hermes_dev_operator;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hermes_dev_operator;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.flyway_schema_history FROM hermes_dev_operator;
