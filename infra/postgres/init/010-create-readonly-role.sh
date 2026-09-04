#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_WRITE_PASSWORD:?POSTGRES_WRITE_PASSWORD is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${POSTGRES_INSPECTOR_PASSWORD:?POSTGRES_INSPECTOR_PASSWORD is required}"

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

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=write_password="$POSTGRES_WRITE_PASSWORD" \
  --set=database="$POSTGRES_DB" <<'EOSQL'
SELECT format('CREATE ROLE pluto_user LOGIN PASSWORD %L', :'write_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_user')
\gexec

ALTER ROLE pluto_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
GRANT CONNECT ON DATABASE :"database" TO pluto_user;
GRANT USAGE ON SCHEMA public TO pluto_user;
EOSQL

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=admin_password="$POSTGRES_ADMIN_PASSWORD" \
  --set=database="$POSTGRES_DB" <<'EOSQL'
SELECT format('CREATE ROLE pluto_admin LOGIN PASSWORD %L', :'admin_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin')
\gexec

ALTER ROLE pluto_admin NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
GRANT CONNECT ON DATABASE :"database" TO pluto_admin;
GRANT USAGE ON SCHEMA public TO pluto_admin;
EOSQL

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=inspector_password="$POSTGRES_INSPECTOR_PASSWORD" \
  --set=database="$POSTGRES_DB" <<'EOSQL'
SELECT format('CREATE ROLE pluto_inspector LOGIN PASSWORD %L', :'inspector_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector')
\gexec

ALTER ROLE pluto_inspector NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM pluto_inspector;
GRANT CONNECT ON DATABASE :"database" TO pluto_inspector;
GRANT USAGE ON SCHEMA public TO pluto_inspector;
EOSQL