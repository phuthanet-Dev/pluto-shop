#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/compose.production.yaml"
BACKUP_TAG="${BACKUP_TAG:-daily}"
WORKDIR=""

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
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${KEYCLOAK_DB_NAME:?KEYCLOAK_DB_NAME is required}"

if ! command -v restic >/dev/null 2>&1; then
  printf '%s\n' 'restic is not installed on this VPS.' >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is not installed on this VPS.' >&2
  exit 1
fi

COMPOSE=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")

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
    send_alert "Pluto Shop backup failed (tag: $BACKUP_TAG)"
  fi
  if [[ -n "$WORKDIR" && "$WORKDIR" == /tmp/pluto-shop-backup.* ]]; then
    rm -rf -- "$WORKDIR"
  fi
  exit "$status"
}
trap cleanup EXIT

copy_volume() {
  local volume="$1"
  local destination="$2"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    if [[ "$BACKUP_TAG" == pre-migration ]]; then
      mkdir -p "$WORKDIR/$destination"
      return
    fi
    printf 'Required backup volume is missing: %s\n' "$volume" >&2
    return 1
  fi
  docker run --rm --pull=missing \
    --volume "$volume:/source:ro" \
    --volume "$WORKDIR:/backup" \
    alpine:3.21 \
    sh -ec 'mkdir -p "/backup/$1"; cp -a /source/. "/backup/$1/"; chown -R "$2:$3" "/backup/$1"' sh "$destination" "$(id -u)" "$(id -g)"
}

check_media_references() {
  local key
  while IFS= read -r key; do
    [[ "$key" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || {
      printf 'Unexpected product media key in database: %s\n' "$key" >&2
      return 1
    }
    if [[ ! -f "$WORKDIR/media/$key" ]]; then
      printf 'Database references missing media file: %s\n' "$key" >&2
      return 1
    fi
  done < "$WORKDIR/media-references.txt"
}

WORKDIR="$(mktemp -d -t pluto-shop-backup.XXXXXX)"
chmod 700 "$WORKDIR"

printf '%s\n' 'Creating online PostgreSQL dump for the application database...'
"${COMPOSE[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  > "$WORKDIR/plutoshop.dump"

printf '%s\n' 'Creating online PostgreSQL dump for Keycloak...'
"${COMPOSE[@]}" exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$1"' \
  sh "$KEYCLOAK_DB_NAME" > "$WORKDIR/keycloak.dump"

printf '%s\n' 'Reading media references from the captured dump...'
bash "$SCRIPT_DIR/dump-media-manifest.sh" "$WORKDIR" > "$WORKDIR/media-references.txt"

printf '%s\n' 'Copying product media and Caddy certificate state...'
copy_volume pluto-shop-production_product-media media
copy_volume pluto-shop-production_caddy-data caddy-data

media_consistent=false
for attempt in 1 2 3; do
  if check_media_references; then
    media_consistent=true
    break
  fi
  if [ "$attempt" -lt 3 ]; then
    printf 'Media manifest mismatch; retrying media copy (attempt %s/3)...\n' "$((attempt + 1))"
    rm -rf -- "$WORKDIR/media"
    copy_volume pluto-shop-production_product-media media
  fi
done
if [[ "$media_consistent" != true ]]; then
  printf '%s\n' 'Database/media backup consistency check failed after three attempts.' >&2
  exit 1
fi

{
  printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'backup_tag=%s\n' "$BACKUP_TAG"
  printf 'image_tag=%s\n' "${IMAGE_TAG:-unknown}"
  printf 'media_reference_count=%s\n' "$(wc -l < "$WORKDIR/media-references.txt" | tr -d ' ')"
} > "$WORKDIR/manifest.txt"

printf '%s\n' 'Uploading encrypted Restic snapshot...'
(
  cd "$WORKDIR"
  restic --no-cache backup --tag pluto-shop --tag "$BACKUP_TAG" .
)

printf '%s\n' 'Applying retention policy (daily 7, weekly 4, monthly 3)...'
restic --no-cache forget \
  --tag pluto-shop \
  --group-by host,tags \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-3}" \
  --prune

if [[ -n "${BACKUP_DEAD_MAN_URL:-}" ]] && command -v curl >/dev/null 2>&1; then
  curl --fail --silent --show-error --max-time 15 "$BACKUP_DEAD_MAN_URL" >/dev/null
fi

printf '%s\n' 'Production backup completed.'
