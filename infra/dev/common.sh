#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$(id -un)" == hermes ]] || { echo 'Run as hermes, never as root or dev.' >&2; exit 1; }
DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
export DOCKER_HOST
unset DOCKER_CONTEXT
docker info --format '{{json .SecurityOptions}}' | grep -q rootless || { echo 'Rootless Docker required.' >&2; exit 1; }
ENV_FILE="$ROOT_DIR/.env.dev-server"
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo 'Run configure.py first.' >&2; exit 1; }
set -a
# Private configuration created by configure.py.
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ "$SHOP_DOMAIN" == dev.phutoshop.com && "$AUTH_DOMAIN" == auth-dev.phutoshop.com ]] || exit 1
[[ "$POSTGRES_DB" == plutoshop_dev && "$KEYCLOAK_DB_NAME" == keycloak_dev ]] || exit 1
[[ "$IMAGE_NAMESPACE" == pluto-dev ]] || exit 1
# Consumed by deploy.sh after sourcing this file.
# shellcheck disable=SC2034
COMPOSE=(docker compose --project-directory "$ROOT_DIR" --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.dev-server.yaml")
