#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
RESTORE_DIR=""
TEMP_CONTAINER=""

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing production environment file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"

if ! command -v restic >/dev/null 2>&1; then
  printf '%s\n' 'restic is not installed on this VPS.' >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is not installed on this VPS.' >&2
  exit 1
fi

send_alert() {
  local message="$1"
  local safe_message
  safe_message="$(printf '%s' "$message" | tr -d '"\r\n')"
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]] && command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --max-time 15 \
      --header 'Content-Type: application/json' \
      --data "{\"text\":\"$safe_message\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

cleanup() {
  local status=$?
  if (( status != 0 )); then
    send_alert 'Pluto Shop restore verification failed'
  fi
  if [[ -n "$TEMP_CONTAINER" ]]; then
    docker rm --force "$TEMP_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ -n "$RESTORE_DIR" && "$RESTORE_DIR" == /tmp/pluto-shop-restore.* ]]; then
    rm -rf -- "$RESTORE_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

RESTORE_DIR="$(mktemp -d -t pluto-shop-restore.XXXXXX)"
chmod 700 "$RESTORE_DIR"

printf '%s\n' 'Checking encrypted Restic repository integrity...'
restic --no-cache check --read-data

printf '%s\n' 'Restoring the latest application snapshot to a temporary directory...'
restic --no-cache restore latest --tag pluto-shop,daily --target "$RESTORE_DIR"

MAIN_DUMP="$(find "$RESTORE_DIR" -type f -name plutoshop.dump -print -quit)"
KEYCLOAK_DUMP="$(find "$RESTORE_DIR" -type f -name keycloak.dump -print -quit)"
MEDIA_DIR="$(find "$RESTORE_DIR" -type d -name media -print -quit)"
REFERENCES_FILE="$(find "$RESTORE_DIR" -type f -name media-references.txt -print -quit)"

[[ -n "$MAIN_DUMP" && -n "$KEYCLOAK_DUMP" && -n "$MEDIA_DIR" && -n "$REFERENCES_FILE" ]] || {
  printf '%s\n' 'The restored snapshot is missing one or more required backup artifacts.' >&2
  exit 1
}

MAIN_RELATIVE="${MAIN_DUMP#"$RESTORE_DIR"/}"
KEYCLOAK_RELATIVE="${KEYCLOAK_DUMP#"$RESTORE_DIR"/}"

TEMP_CONTAINER="pluto-shop-restore-check-$$"
TEMP_PASSWORD="$(openssl rand -hex 32)"
docker run --detach --rm \
  --name "$TEMP_CONTAINER" \
  --network none \
  --volume "$RESTORE_DIR:/restore:ro" \
  --env POSTGRES_PASSWORD="$TEMP_PASSWORD" \
  --env POSTGRES_DB=plutoshop_restore \
  postgres:18.6 >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$TEMP_CONTAINER" pg_isready -U postgres -d plutoshop_restore >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    printf '%s\n' 'Temporary PostgreSQL did not become ready for restore verification.' >&2
    exit 1
  fi
  sleep 2
done

printf '%s\n' 'Restoring both databases into the temporary PostgreSQL instance...'
docker exec "$TEMP_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c \
  'CREATE ROLE pluto_app; CREATE ROLE pluto_user; CREATE ROLE pluto_admin; CREATE ROLE pluto_inspector;' >/dev/null
docker exec --env PGPASSWORD="$TEMP_PASSWORD" "$TEMP_CONTAINER" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname plutoshop_restore \
  --username postgres \
  "/restore/$MAIN_RELATIVE"

docker exec --env PGPASSWORD="$TEMP_PASSWORD" "$TEMP_CONTAINER" psql \
  --username postgres \
  --dbname plutoshop_restore \
  --set ON_ERROR_STOP=1 \
  --command 'CREATE DATABASE keycloak_restore'

docker exec --env PGPASSWORD="$TEMP_PASSWORD" "$TEMP_CONTAINER" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname keycloak_restore \
  --username postgres \
  "/restore/$KEYCLOAK_RELATIVE"

PRODUCTS_TABLE="$(docker exec --env PGPASSWORD="$TEMP_PASSWORD" "$TEMP_CONTAINER" psql --no-align --tuples-only --username postgres --dbname plutoshop_restore --command "SELECT to_regclass('public.products')")"
REALM_TABLE="$(docker exec --env PGPASSWORD="$TEMP_PASSWORD" "$TEMP_CONTAINER" psql --no-align --tuples-only --username postgres --dbname keycloak_restore --command "SELECT to_regclass('public.realm')")"
[[ "$PRODUCTS_TABLE" == "products" ]] || {
  printf '%s\n' 'The restored application database is missing public.products.' >&2
  exit 1
}
[[ "$REALM_TABLE" == "realm" ]] || {
  printf '%s\n' 'The restored Keycloak database is missing public.realm.' >&2
  exit 1
}

docker exec "$TEMP_CONTAINER" psql -X -U postgres -d plutoshop_restore -At -v ON_ERROR_STOP=1 \
  -c 'SELECT image_key FROM products WHERE image_key IS NOT NULL ORDER BY image_key' > "$RESTORE_DIR/restored-references.txt"
cmp "$REFERENCES_FILE" "$RESTORE_DIR/restored-references.txt"
while IFS= read -r key; do
  [[ "$key" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || {
    printf 'Unexpected product media key in restored manifest: %s\n' "$key" >&2
    exit 1
  }
  if [[ ! -f "$MEDIA_DIR/$key" ]]; then
    printf 'Restored snapshot is missing referenced media file: %s\n' "$key" >&2
    exit 1
  fi
done < "$RESTORE_DIR/restored-references.txt"

printf '%s\n' 'Full restore verification completed successfully.'
