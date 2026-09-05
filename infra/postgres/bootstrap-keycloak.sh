#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_OWNER_PASSWORD:?POSTGRES_OWNER_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${KEYCLOAK_DB_NAME:?KEYCLOAK_DB_NAME is required}"
: "${KEYCLOAK_DB_USER:?KEYCLOAK_DB_USER is required}"
: "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD is required}"

for attempt in $(seq 1 60); do
  if PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
      --host postgres \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --command 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    printf '%s\n' 'PostgreSQL did not become ready for Keycloak database bootstrap.' >&2
    exit 1
  fi
  sleep 2
done

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --set=ON_ERROR_STOP=1 \
  --host postgres \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=role_name="$KEYCLOAK_DB_USER" \
  --set=role_password="$KEYCLOAK_DB_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name')
\gexec

ALTER ROLE :"role_name" NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
EOSQL

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --set=ON_ERROR_STOP=1 \
  --host postgres \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=database_name="$KEYCLOAK_DB_NAME" \
  --set=role_name="$KEYCLOAK_DB_USER" <<'EOSQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'database_name', :'role_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database_name')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'database_name', :'role_name')
WHERE EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database_name')
\gexec
EOSQL

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --set=ON_ERROR_STOP=1 \
  --host postgres \
  --username "$POSTGRES_USER" \
  --dbname "$KEYCLOAK_DB_NAME" \
  --set=role_name="$KEYCLOAK_DB_USER" <<'EOSQL'
ALTER SCHEMA public OWNER TO :"role_name";
GRANT ALL ON SCHEMA public TO :"role_name";
EOSQL
