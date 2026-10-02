#!/usr/bin/env bash
# Compatible environment controls for the installed older gateway, without touching an active build.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
dropin=/srv/hermes/.config/systemd/user/hermes-gateway.service.d/pluto-dev.conf
[[ -f "$dropin" ]] || { echo 'Dev gateway systemd drop-in is missing; run admin-start-dev.sh first.' >&2; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -o hermes -g hermes -m 600 "$src/configure-hermes.py" /srv/hermes/dev-control/configure-hermes.py
runuser -u hermes -- env HOME=/srv/hermes python3 /srv/hermes/dev-control/configure-hermes.py
grep -qxF 'PrivateUsers=true' "$dropin" || printf '\nPrivateUsers=true\n' >> "$dropin"
chown hermes:hermes "$dropin"
uid="$(id -u hermes)"
userctl=(runuser -u hermes -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user)
"${userctl[@]}" daemon-reload
"${userctl[@]}" restart hermes-gateway.service
"${userctl[@]}" is-active --quiet hermes-gateway.service
private_users="$("${userctl[@]}" show hermes-gateway.service --property=PrivateUsers --value)"
[[ "$private_users" == yes ]] || { echo 'Gateway restarted, but PrivateUsers is not active.' >&2; exit 1; }
echo 'Gateway restarted with the original owner allowlist and PrivateUsers enabled.'
