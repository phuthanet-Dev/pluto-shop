#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"

# psql variables quote the generated password as a SQL literal; the value is never logged.
psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$POSTGRES_APP_PASSWORD" \
  --set=database="$POSTGRES_DB" <<'EOSQL'
SELECT format('CREATE ROLE pluto_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_app')
\gexec

ALTER ROLE pluto_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE :"database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database" TO pluto_app;
GRANT USAGE ON SCHEMA public TO pluto_app;
EOSQL
