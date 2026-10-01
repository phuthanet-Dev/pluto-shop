#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_OWNER_PASSWORD:?POSTGRES_OWNER_PASSWORD is required}"
: "${POSTGRES_HERMES_PASSWORD:?POSTGRES_HERMES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${KEYCLOAK_DB_NAME:?KEYCLOAK_DB_NAME is required}"
: "${KEYCLOAK_DB_USER:?KEYCLOAK_DB_USER is required}"

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
SQL_FILE="${1:-$(dirname -- "${BASH_SOURCE[0]}")/hermes-db-role-bootstrap.sql}"
[[ -f "$SQL_FILE" && ! -L "$SQL_FILE" ]] || {
  printf '%s\n' 'Hermes DB bootstrap SQL is unavailable.' >&2
  exit 1
}

for attempt in $(seq 1 60); do
  if PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
      --no-psqlrc \
      --host "$POSTGRES_HOST" \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --command 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    printf '%s\n' 'PostgreSQL did not become ready for Hermes DB role bootstrap.' >&2
    exit 1
  fi
  sleep 2
done

PGPASSWORD="$POSTGRES_OWNER_PASSWORD" psql \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --host "$POSTGRES_HOST" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=application_database="$POSTGRES_DB" \
  --set=owner_role="$POSTGRES_USER" \
  --set=keycloak_database="$KEYCLOAK_DB_NAME" \
  --set=keycloak_role="$KEYCLOAK_DB_USER" \
  --file "$SQL_FILE"
printf '%s\n' 'Hermes Dev database role is ready.'
