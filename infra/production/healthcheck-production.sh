#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing production environment file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${SHOP_DOMAIN:?SHOP_DOMAIN is required}"
: "${AUTH_DOMAIN:?AUTH_DOMAIN is required}"

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

status=0
if ! curl --fail --silent --show-error --max-time 15 "https://$SHOP_DOMAIN/th" >/dev/null; then
  printf '%s\n' 'Shop health endpoint failed.' >&2
  status=1
fi
if ! curl --fail --silent --show-error --max-time 15 \
  "https://$AUTH_DOMAIN/realms/pluto/.well-known/openid-configuration" |
  grep -q '"issuer"'; then
  printf '%s\n' 'Keycloak discovery endpoint failed.' >&2
  status=1
fi

if (( status != 0 )); then
  send_alert 'Pluto Shop production health check failed'
else
  printf '%s\n' 'Production health check passed.'
fi
exit "$status"
