#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$EUID" == 0 ]] || exit 1
mode="${1:?dev or production}"
[[ "$mode" == dev || "$mode" == production ]] || exit 1
set -a
source /etc/pluto-dev-backup.env
set +a
snapshot="$(cat "/var/lib/pluto-dev-backup/$mode-snapshot")"
[[ "$snapshot" =~ ^[0-9a-f]{8,64}$ ]] || exit 1
work="$(mktemp -d /var/lib/pluto-dev-backup/restore.XXXXXX)"
container="pluto-verify-$(cat /proc/sys/kernel/random/uuid)"
d=(docker --host unix:///var/run/docker.sock)
cleanup() { "${d[@]}" rm -f -v "$container" >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap cleanup EXIT
restic --no-cache restore "$snapshot" --target "$work"
dump="$(find "$work" -type f -name app.dump -print -quit)"
[[ -n "$dump" ]] || exit 1
artifacts="$(dirname "$dump")"
for name in app.dump keycloak.dump media.tar runtime.env images.txt; do test -s "$artifacts/$name"; done
"${d[@]}" run -d --name "$container" --network none --memory=1g \
    -e POSTGRES_HOST_AUTH_METHOD=trust -v "$artifacts:/restore:ro" postgres:18.6 >/dev/null
for attempt in $(seq 1 60); do
    "${d[@]}" exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
    [[ "$attempt" != 60 ]] || exit 1
    sleep 2
done
"${d[@]}" exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c \
    'CREATE ROLE pluto_app; CREATE ROLE pluto_user; CREATE ROLE pluto_admin; CREATE ROLE pluto_inspector;'
for name in app keycloak; do
    "${d[@]}" exec "$container" createdb -U postgres "$name"
    "${d[@]}" exec "$container" pg_restore -U postgres --exit-on-error --no-owner --no-acl -d "$name" "/restore/$name.dump"
done
products="$("${d[@]}" exec "$container" psql -U postgres -d app -Atc "SELECT to_regclass('public.products')")"
if [[ "$products" == products ]]; then
    "${d[@]}" exec "$container" psql -U postgres -d app -Atc 'SELECT image_key FROM products WHERE image_key IS NOT NULL' > "$work/media-keys"
    python3 - "$artifacts/media.tar" "$work/media-keys" <<'PY'
import sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    names = {x.name.removeprefix('./') for x in archive if x.isfile()}
for key in open(sys.argv[2]):
    if key.strip() not in names: raise SystemExit('Missing referenced media in backup')
PY
elif [[ "$mode" == production ]]; then
    echo 'Production products table missing.' >&2; exit 1
fi
if [[ "$mode" == production ]]; then
    realm="$("${d[@]}" exec "$container" psql -U postgres -d keycloak -Atc "SELECT to_regclass('public.realm')")"
    [[ "$realm" == realm ]] || exit 1
    tar -tf "$artifacts/production-config.tar" >/dev/null
    tar -tf "$artifacts/caddy-data.tar" >/dev/null
fi
printf '%s\n' "$snapshot" > "/var/lib/pluto-dev-backup/$mode-verified"
echo "Full restore passed for $mode snapshot $snapshot"
