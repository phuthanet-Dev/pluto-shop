#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
unset DOCKER_CONTEXT DOCKER_HOST
export DOCKER_HOST=unix:///var/run/docker.sock
state=/var/lib/pluto-dev-backup/private/pause
[[ ! -e "$state" ]] || { echo 'Pause state already exists; inspect it before retrying.'; exit 1; }
root=/opt/pluto-shop/current
compose=(docker compose --project-directory "$root" --env-file "$root/.env.production" -f "$root/compose.production.yaml")
# Pin rollback material BEFORE changing any service.
install -d -m 700 "$state"
cp "$root/.env.production" "$state/production.env"
cp "$root/compose.production.yaml" "$state/compose.production.yaml"
cp "$root/infra/production/Caddyfile" "$state/Caddyfile"
for timer in pluto-shop-backup.timer pluto-shop-restore-check.timer pluto-shop-health.timer; do
    if systemctl is-active --quiet "$timer"; then echo "$timer" >> "$state/active-timers"; fi
    if systemctl is-enabled --quiet "$timer"; then echo "$timer" >> "$state/enabled-timers"; fi
done
touch "$state/active-timers" "$state/enabled-timers"
"${compose[@]}" config --quiet
# Validate edge config using existing operator email without copying payment secrets.
python3 - <<'PY'
import shlex, os
from pathlib import Path
values={}
for line in Path('/opt/pluto-shop/current/.env.production').read_text().splitlines():
    if line.startswith('ACME_EMAIL='): values['ACME_EMAIL']=' '.join(shlex.split(line.split('=',1)[1],comments=True))
if not values.get('ACME_EMAIL'): raise SystemExit('ACME_EMAIL missing')
os.umask(0o077)
Path('/opt/pluto-dev-ops/edge.env').write_text('ACME_EMAIL='+shlex.quote(values['ACME_EMAIL'])+'\n')
PY
edge=(docker compose --env-file /opt/pluto-dev-ops/edge.env -f /opt/pluto-dev-ops/compose.edge.yaml)
"${edge[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
# Stop writers for a consistent final snapshot. A failure restores them automatically.
recover() {
    status=$?
    if (( status != 0 )); then
        "${edge[@]}" stop caddy || true
        "${compose[@]}" up -d --no-deps --wait postgres keycloak api web caddy || true
        while read -r timer; do systemctl enable "$timer"; done < "$state/enabled-timers"
        while read -r timer; do systemctl start "$timer"; done < "$state/active-timers"
        echo 'Pause failed; attempted to restore original services. Inspect status before retrying.' >&2
    fi
    exit "$status"
}
trap recover EXIT
systemctl disable --now pluto-shop-backup.timer pluto-shop-restore-check.timer pluto-shop-health.timer
systemctl stop pluto-shop-backup.service pluto-shop-restore-check.service pluto-shop-health.service
"${compose[@]}" stop web api keycloak
bash /opt/pluto-dev-ops/backup.sh production
bash /opt/pluto-dev-ops/verify-backup.sh production
cmp /var/lib/pluto-dev-backup/production-snapshot /var/lib/pluto-dev-backup/production-verified
"${compose[@]}" stop caddy
"${edge[@]}" up -d --wait
code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' https://phutoshop.com/)"
[[ "$code" == 503 ]] || { echo 'Maintenance check failed.'; exit 1; }
"${compose[@]}" stop postgres
touch "$state/complete"
systemctl enable --now pluto-dev-health.timer
trap - EXIT
echo 'Production parked; volumes and rollback files preserved.'
