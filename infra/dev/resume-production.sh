#!/usr/bin/env bash
# Restores the preserved old deployment only. Does not migrate dev transactions.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
unset DOCKER_CONTEXT DOCKER_HOST
export DOCKER_HOST=unix:///var/run/docker.sock
state=/var/lib/pluto-dev-backup/private/pause
test -f "$state/complete"
systemctl disable --now pluto-dev-health.timer
root=/opt/pluto-shop/current
# The preserved checkout is intentionally never updated by the dev deployment.
cmp "$root/infra/production/Caddyfile" "$state/Caddyfile"
compose=(docker compose --project-directory "$root" --env-file "$state/production.env" -f "$state/compose.production.yaml")
"${compose[@]}" up -d --no-deps --wait --wait-timeout 180 postgres
"${compose[@]}" up -d --no-deps --wait --wait-timeout 300 keycloak api web
docker compose --env-file /opt/pluto-dev-ops/edge.env -f /opt/pluto-dev-ops/compose.edge.yaml stop caddy
if ! "${compose[@]}" up -d --no-deps --wait caddy; then
    docker compose --env-file /opt/pluto-dev-ops/edge.env -f /opt/pluto-dev-ops/compose.edge.yaml up -d
    exit 1
fi
curl -fsS --max-time 20 https://phutoshop.com/th >/dev/null
while read -r timer; do systemctl enable "$timer"; done < "$state/enabled-timers"
while read -r timer; do systemctl start "$timer"; done < "$state/active-timers"
echo 'Original production restored. Dev data preserved; public dev routing is offline.'
