#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$(id -un)" == hermes ]] || { echo 'Run as hermes, never as root or dev.' >&2; exit 1; }
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
unset DOCKER_CONTEXT
docker info --format '{{json .SecurityOptions}}' | grep -q rootless || { echo 'Rootless Docker required.' >&2; exit 1; }
ENV_FILE="$ROOT_DIR/.env.dev-server"
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo 'Run configure.py first.' >&2; exit 1; }
set -a
source "$ENV_FILE"
set +a
[[ "$SHOP_DOMAIN" == dev.phutoshop.com && "$AUTH_DOMAIN" == auth-dev.phutoshop.com ]] || exit 1
[[ "$POSTGRES_DB" == plutoshop_dev && "$KEYCLOAK_DB_NAME" == keycloak_dev ]] || exit 1
[[ "$IMAGE_NAMESPACE" == pluto-dev ]] || exit 1
COMPOSE=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.dev-server.yaml")
