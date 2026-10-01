#!/usr/bin/env bash
set -Eeuo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/common.sh"
cd "$ROOT_DIR"
exec 9>/srv/hermes/dev-control/deploy.lock
flock -n 9 || { echo 'Another deployment is active.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit work before deploying.' >&2; exit 1; }
branch="$(git branch --show-current)"
[[ "$branch" == hermes/* || "$branch" == codex/linux-dev-environment ]] || { echo 'Use hermes/* or the setup branch.' >&2; exit 1; }
python3 "$script_dir/ensure-hermes-db-password.py"
IMAGE_TAG="$(git rev-parse HEAD)"
export IMAGE_TAG
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || exit 1
if [[ -f infra/dev/runtime/deployed-sha ]]; then
    previous="$(cat infra/dev/runtime/deployed-sha)"
    git merge-base --is-ancestor "$previous" HEAD || { echo 'Rebase onto the deployed commit first.' >&2; exit 1; }
fi
mkdir -p infra/dev/runtime
chmod 700 infra/dev/runtime
# Build/test before touching running services. The rootless daemon is resource-capped.
docker run --rm --mount "type=bind,src=$ROOT_DIR,dst=/workspace" -w /workspace \
    --memory=2g --cpus=2 node:24.18.0-alpine sh -ec \
    'npm ci && npm run lint && npm run typecheck && npm run test --workspace @pluto-shop/web -- --maxWorkers=1 --testTimeout=15000 && npm run test:root && npm run test:production-config && npm run test:dev-server'
# API integration tests use Testcontainers through the DEV rootless socket only.
docker run --rm --network host --mount "type=bind,src=$ROOT_DIR/apps/api,dst=/workspace" \
    --mount "type=bind,src=$ROOT_DIR/infra/dev/bootstrap-hermes-db-role.sh,dst=/tmp/bootstrap-hermes-db-role.sh,readonly" \
    --mount "type=bind,src=$ROOT_DIR/infra/dev/hermes-db-role-bootstrap.sql,dst=/tmp/hermes-db-role-bootstrap.sql,readonly" \
    --mount "type=bind,src=/run/user/$(id -u)/docker.sock,dst=/var/run/docker.sock" \
    -e DOCKER_HOST=unix:///var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 \
    -e TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/run/user/$(id -u)/docker.sock" \
    --memory=2g --cpus=2 -w /workspace maven:3.9.11-eclipse-temurin-17 mvn -B -ntp verify
docker build -t "pluto-dev-api:$IMAGE_TAG" apps/api
docker build -t "pluto-dev-keycloak:$IMAGE_TAG" infra/keycloak
docker build --build-arg INTERNAL_API_URL=http://api:8080 -t "pluto-dev-web:$IMAGE_TAG" -f apps/web/Dockerfile .
docker run --rm --network none --mount "type=bind,src=$ROOT_DIR,dst=/workspace" -w /workspace \
    -e SHOP_DOMAIN -e AUTH_DOMAIN -e SMTP_HOST -e SMTP_PORT -e SMTP_FROM \
    -e SMTP_FROM_DISPLAY_NAME -e SMTP_USERNAME -e SMTP_PASSWORD node:24.18.0-alpine \
    node --input-type=module -e 'import {renderProductionRealm} from "./infra/production/render-production-realm.mjs"; await renderProductionRealm({outputPath:"./infra/dev/runtime/realm-dev.json"});'
"${COMPOSE[@]}" config --quiet
[[ "$(git rev-parse HEAD)" == "$IMAGE_TAG" && -z "$(git status --porcelain)" ]] || { echo 'Source changed during build; restart from a committed tree.' >&2; exit 1; }
# Bootstrap empty DBs, then demand an off-host backup receipt before every migration.
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres
"${COMPOSE[@]}" run --rm role-bootstrap
"${COMPOSE[@]}" run --rm keycloak-db-bootstrap
docker volume create pluto-shop-dev_product-media >/dev/null
request="$(cat /proc/sys/kernel/random/uuid)"
printf '%s\n' "$request" > /srv/hermes/dev-control/request.tmp
mv /srv/hermes/dev-control/request.tmp /srv/hermes/dev-control/request
echo 'Waiting for administrator-owned encrypted off-host backup...'
for attempt in $(seq 1 600); do
    [[ "$(cat /var/lib/pluto-dev-backup/receipt 2>/dev/null || true)" == "$request" ]] && break
    [[ "$attempt" != 600 ]] || { echo 'Backup did not complete; deployment stopped before migration.' >&2; exit 1; }
    sleep 2
done
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" run --rm hermes-db-role-bootstrap
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 300 keycloak
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 180 api web
curl -fsS --max-time 20 http://127.0.0.1:13000/th >/dev/null
printf '%s\n' "$IMAGE_TAG" > infra/dev/runtime/deployed-sha
printf 'Dev build healthy: %s\nhttps://dev.phutoshop.com/th\n' "$IMAGE_TAG"
echo 'Before initial publication: complete DNS, backup restore, payment and login acceptance in the runbook.'
