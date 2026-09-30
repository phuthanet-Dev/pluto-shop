#!/usr/bin/env bash
# Final owner step: require the tested latest dev commit, then snapshot and park production.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$src/../.." && pwd)"
[[ -z "$(git -c safe.directory="$repo" -C "$repo" status --porcelain)" ]] || exit 1
expected="$(git -c safe.directory="$repo" -C "$repo" rev-parse HEAD)"
actual="$(cat /srv/hermes/pluto-shop/infra/dev/runtime/deployed-sha)"
[[ "$expected" == "$actual" ]] || { echo 'Build the current setup commit successfully before publication.'; exit 1; }
curl -fsS --max-time 20 http://127.0.0.1:13000/th >/dev/null
curl -fsS --max-time 20 http://127.0.0.1:18081/realms/pluto/.well-known/openid-configuration >/dev/null
for host in dev.phutoshop.com auth-dev.phutoshop.com; do
    getent ahostsv4 "$host" | grep -q '^217\.216\.39\.229 ' || { echo "DNS not ready for $host"; exit 1; }
done
for file in backup.sh verify-backup.sh pause-production.sh resume-production.sh healthcheck.sh Caddyfile compose.edge.yaml; do
    install -o root -g root -m 644 "$src/$file" "/opt/pluto-dev-ops/$file"
done
bash /opt/pluto-dev-ops/backup.sh dev
bash /opt/pluto-dev-ops/verify-backup.sh dev
systemctl enable --now pluto-dev-backup.timer
bash /opt/pluto-dev-ops/pause-production.sh
bash /opt/pluto-dev-ops/healthcheck.sh
echo 'Dev published; production parked. Complete owner login and small-value payment acceptance.'
