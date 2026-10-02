#!/usr/bin/env bash
# Compatible environment controls for the installed older gateway, without touching an active build.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
[[ -x /opt/pluto-dev-ops/admin-migrate-hermes-gateway.sh && -O /opt/pluto-dev-ops/admin-migrate-hermes-gateway.sh ]] || { echo 'Install the reviewed root-owned Hermes gateway migration helper under /opt/pluto-dev-ops first.' >&2; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -o hermes -g hermes -m 600 "$src/configure-hermes.py" /srv/hermes/dev-control/configure-hermes.py
runuser -u hermes -- env HOME=/srv/hermes python3 /srv/hermes/dev-control/configure-hermes.py
bash /opt/pluto-dev-ops/admin-migrate-hermes-gateway.sh
echo 'Gateway restarted with the original owner allowlist and system-managed Production isolation.'
