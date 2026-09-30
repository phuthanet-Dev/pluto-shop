#!/usr/bin/env bash
# Compatible environment controls for the installed older gateway, without touching an active build.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -o hermes -g hermes -m 600 "$src/configure-hermes.py" /srv/hermes/dev-control/configure-hermes.py
runuser -u hermes -- env HOME=/srv/hermes python3 /srv/hermes/dev-control/configure-hermes.py
uid="$(id -u hermes)"
userctl=(runuser -u hermes -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user)
"${userctl[@]}" restart hermes-gateway.service
"${userctl[@]}" is-active --quiet hermes-gateway.service
echo 'Gateway restarted with explicit .env allow-all=false and the original owner allowlist.'
