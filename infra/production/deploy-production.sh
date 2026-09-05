#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/compose.production.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing production environment file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

REQUESTED_IMAGE_TAG="${IMAGE_TAG:-}"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
if [[ -n "$REQUESTED_IMAGE_TAG" ]]; then
  export IMAGE_TAG="$REQUESTED_IMAGE_TAG"
fi

: "${IMAGE_NAMESPACE:?IMAGE_NAMESPACE is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${SHOP_DOMAIN:?SHOP_DOMAIN is required}"
: "${AUTH_DOMAIN:?AUTH_DOMAIN is required}"
: "${KEYCLOAK_REALM_FILE:?KEYCLOAK_REALM_FILE is required}"

if [[ ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' 'IMAGE_TAG must be the 40-character Git commit SHA.' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is not installed on this VPS.' >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required for the external endpoint smoke checks.' >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' 'git is required to pin the checkout to IMAGE_TAG.' >&2
  exit 1
fi

CURRENT_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
if [[ "$CURRENT_COMMIT" != "$IMAGE_TAG" ]]; then
  printf 'The checkout (%s) does not match IMAGE_TAG (%s).\n' "$CURRENT_COMMIT" "$IMAGE_TAG" >&2
  exit 1
fi
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  printf '%s\n' 'The production checkout has uncommitted changes.' >&2
  exit 1
fi

COMPOSE=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")

send_alert() {
  local message="$1"
  local safe_message
  safe_message="$(printf '%s' "$message" | tr -d '"\r\n')"
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 15 \
      --header 'Content-Type: application/json' \
      --data "{\"text\":\"$safe_message\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

on_exit() {
  local status=$?
  if (( status != 0 )); then
    send_alert "Pluto Shop deployment failed for image tag $IMAGE_TAG"
  fi
  exit "$status"
}
trap on_exit EXIT

REALM_PATH="$KEYCLOAK_REALM_FILE"
if [[ "$REALM_PATH" != /* ]]; then
  REALM_PATH="$ROOT_DIR/${REALM_PATH#./}"
fi

printf '%s\n' 'Rendering the production Keycloak realm from the current environment...'
docker run --rm \
  --network none \
  --user "$(id -u):$(id -g)" \
  --env SHOP_DOMAIN --env AUTH_DOMAIN --env SMTP_HOST --env SMTP_PORT \
  --env SMTP_FROM --env SMTP_FROM_DISPLAY_NAME --env SMTP_USERNAME --env SMTP_PASSWORD \
  --volume "$ROOT_DIR:/workspace:rw" \
  --workdir /workspace \
  node:24.18.0-alpine \
  node infra/production/render-production-realm.mjs
test -s "$REALM_PATH"

printf '%s\n' 'Validating the production Compose configuration...'
"${COMPOSE[@]}" config --quiet

if [[ -n "${GHCR_TOKEN:-}" && "${GHCR_TOKEN:-}" != replace-with-* ]]; then
  : "${GHCR_USERNAME:?GHCR_USERNAME is required when GHCR_TOKEN is configured}"
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin
fi

printf 'Pulling immutable images for commit %s...\n' "$IMAGE_TAG"
"${COMPOSE[@]}" pull keycloak api web

printf '%s\n' 'Starting PostgreSQL before the pre-migration backup...'
"${COMPOSE[@]}" up --detach --wait --wait-timeout 180 postgres
"${COMPOSE[@]}" run --rm role-bootstrap
"${COMPOSE[@]}" run --rm keycloak-db-bootstrap

printf '%s\n' 'Taking the mandatory pre-migration backup...'
ENV_FILE="$ENV_FILE" BACKUP_TAG=pre-migration bash "$SCRIPT_DIR/backup-production.sh"

printf '%s\n' 'Applying Flyway migrations and starting the production stack...'
"${COMPOSE[@]}" up --detach --remove-orphans --wait --wait-timeout 300

printf '%s\n' 'Running external HTTPS smoke checks...'
curl --fail --silent --show-error --max-time 20 "https://$SHOP_DOMAIN/th" >/dev/null
curl --fail --silent --show-error --max-time 20 "https://$AUTH_DOMAIN/realms/pluto/.well-known/openid-configuration" |
  grep -q '"issuer"'

"${COMPOSE[@]}" ps
printf 'Production deployment completed for image tag %s.\n' "$IMAGE_TAG"
