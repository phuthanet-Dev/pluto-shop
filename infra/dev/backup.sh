#!/usr/bin/env bash
# Installed root-owned under /opt/pluto-dev-ops. Never source code or env from Hermes.
set -Eeuo pipefail
umask 077
[[ "$EUID" == 0 ]] || exit 1
mode="${1:-dev}"
[[ "$mode" == dev || "$mode" == production ]] || exit 1
exec 9>/var/lib/pluto-dev-backup/backup.lock
flock 9
set -a
source /etc/pluto-dev-backup.env
set +a
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD:?}"
[[ "$RESTIC_REPOSITORY" == s3:* || "$RESTIC_REPOSITORY" == sftp:* || "$RESTIC_REPOSITORY" == rest:* || "$RESTIC_REPOSITORY" == b2:* || "$RESTIC_REPOSITORY" == azure:* || "$RESTIC_REPOSITORY" == gs:* ]] || { echo 'Off-host Restic repository required.'; exit 1; }
uid="$(id -u hermes)"
unset DOCKER_CONTEXT DOCKER_HOST
if [[ "$mode" == dev ]]; then
    d=(docker --host "unix:///run/user/$uid/docker.sock")
    prefix=pluto-shop-dev
    config=/srv/hermes/pluto-shop/.env.dev-server
    source_dir=/srv/hermes/pluto-shop
    tag=pluto-dev
    request="$(cat /srv/hermes/dev-control/request 2>/dev/null || true)"
    [[ -z "$request" || "$request" =~ ^[0-9a-f-]{36}$ ]] || exit 1
    kcdb=keycloak_dev
else
    d=(docker --host unix:///var/run/docker.sock)
    prefix=pluto-shop-production
    config=/opt/pluto-shop/current/.env.production
    source_dir=/opt/pluto-shop/current
    tag=pluto-freeze
    kcdb="$("${d[@]}" inspect "${prefix}-keycloak-1" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^KC_DB_URL_DATABASE=//p')"
    [[ "$kcdb" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || exit 1
fi
work="$(mktemp -d /var/lib/pluto-dev-backup/snapshot.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
"${d[@]}" exec "${prefix}-postgres-1" sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$work/app.dump"
"${d[@]}" exec "${prefix}-postgres-1" sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$1" -Fc --no-owner --no-acl' sh "$kcdb" > "$work/keycloak.dump"
"${d[@]}" run --rm --network none -v "${prefix}_product-media:/source:ro" \
    alpine:3.21 tar -C /source -cf - . > "$work/media.tar"
# No dereference of agent-controlled symlinks. Missing regular configuration blocks backup.
[[ -f "$config" && ! -L "$config" ]] || exit 1
cp --no-dereference "$config" "$work/runtime.env"
"${d[@]}" ps --filter "name=${prefix}-" --format '{{.Names}} {{.Image}}' > "$work/images.txt"
if [[ "$mode" == production ]]; then
    tar -C "$source_dir" -cf "$work/production-config.tar" compose.production.yaml infra/production infra/keycloak
    "${d[@]}" run --rm --network none -v "${prefix}_caddy-data:/source:ro" alpine:3.21 tar -C /source -cf - . > "$work/caddy-data.tar"
else
    cp --no-dereference "$source_dir/compose.dev-server.yaml" "$work/compose.dev-server.yaml"
    if [[ -f "$source_dir/infra/dev/runtime/realm-dev.json" ]]; then
        cp --no-dereference "$source_dir/infra/dev/runtime/realm-dev.json" "$work/realm-dev.json"
    fi
fi
restic --no-cache backup --json --exclude result.json --tag "$tag" "$work" > "$work/result.json"
snapshot="$(python3 - "$work/result.json" <<'PY'
import json, sys
for line in open(sys.argv[1]):
    item=json.loads(line)
    if item.get('message_type') == 'summary': print(item['snapshot_id'])
PY
)"
[[ "$snapshot" =~ ^[0-9a-f]{8,64}$ ]] || exit 1
printf '%s\n' "$snapshot" > "/var/lib/pluto-dev-backup/$mode-snapshot"
if [[ "$mode" == dev && -n "$request" ]]; then
    bash /opt/pluto-dev-ops/verify-backup.sh dev
    printf '%s\n' "$request" > /var/lib/pluto-dev-backup/receipt.tmp
    chmod 644 /var/lib/pluto-dev-backup/receipt.tmp
    mv /var/lib/pluto-dev-backup/receipt.tmp /var/lib/pluto-dev-backup/receipt
fi
echo "Encrypted off-host $mode snapshot: $snapshot"
# Deliberately no forget/prune. Freeze snapshots must survive normal retention.
