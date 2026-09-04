#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_OWNER_PASSWORD:?POSTGRES_OWNER_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${POSTGRES_INSPECTOR_PASSWORD:?POSTGRES_INSPECTOR_PASSWORD is required}"

for attempt in $(seq 1 60); do
  if PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
      --host postgres \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --command 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    printf '%s\n' 'PostgreSQL did not become ready for role bootstrap.' >&2
    exit 1
  fi
  sleep 2
done

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --set=ON_ERROR_STOP=1 \
  --host postgres \
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

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --set=ON_ERROR_STOP=1 \
  --host postgres \
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
