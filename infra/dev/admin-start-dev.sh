#!/usr/bin/env bash
# Run by the owner after initial installation and configure.py.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || exit 1
if systemctl is-active --quiet pluto-dev-build.service; then
    echo 'A dev build is already active. Wait for it to finish before updating the workspace.'; exit 1
fi
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$src/../.." && pwd)"
uid="$(id -u hermes)"
[[ -z "$(git -c safe.directory="$repo" -C "$repo" status --porcelain)" ]] || exit 1
[[ -z "$(runuser -u hermes -- git -C /srv/hermes/pluto-shop status --porcelain)" ]] || { echo 'Preserve and commit existing Hermes work first.'; exit 1; }
git -c safe.directory="$repo" -C "$repo" bundle create /var/lib/pluto-dev-backup/private/update.bundle codex/linux-dev-environment
install -o hermes -g hermes -m 600 /var/lib/pluto-dev-backup/private/update.bundle /srv/hermes/dev-control/update.bundle
runuser -u hermes -- git -C /srv/hermes/pluto-shop fetch /srv/hermes/dev-control/update.bundle codex/linux-dev-environment
runuser -u hermes -- git -C /srv/hermes/pluto-shop merge --ff-only FETCH_HEAD
if ! runuser -u hermes -- git -C /srv/hermes/pluto-shop config user.name >/dev/null; then
    runuser -u hermes -- git -C /srv/hermes/pluto-shop config user.name 'Hermes Dev Agent'
fi
if ! runuser -u hermes -- git -C /srv/hermes/pluto-shop config user.email >/dev/null; then
    runuser -u hermes -- git -C /srv/hermes/pluto-shop config user.email hermes@localhost
fi
runuser -u hermes -- env HOME=/srv/hermes python3 /srv/hermes/pluto-shop/infra/dev/configure-hermes.py
dropin=/srv/hermes/.config/systemd/user/hermes-gateway.service.d
runuser -u hermes -- mkdir -p "$dropin"
cat > "$dropin/pluto-dev.conf" <<UNIT
[Service]
WorkingDirectory=/srv/hermes/pluto-shop
Environment=HERMES_HOME=/srv/hermes/.hermes
Environment=DOCKER_HOST=unix:///run/user/$uid/docker.sock
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/hermes /run/user/$uid
InaccessiblePaths=-/var/run/docker.sock -/opt/pluto-shop -/etc/pluto-dev-backup.env
CPUQuota=100%
MemoryMax=1G
TasksMax=512
UNIT
chown hermes:hermes "$dropin/pluto-dev.conf"
userctl=(runuser -u hermes -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user)
"${userctl[@]}" daemon-reload
"${userctl[@]}" restart hermes-gateway.service
"${userctl[@]}" is-active --quiet hermes-gateway.service
if [[ ! -e /var/log/pluto-dev-build.log ]]; then
    install -m 640 -o root -g dev /dev/null /var/log/pluto-dev-build.log
fi
cat > /etc/systemd/system/pluto-dev-build.service <<UNIT
[Unit]
Description=Initial Phuto dev build as unprivileged Hermes
[Service]
Type=oneshot
User=hermes
Group=hermes
Slice=user-$uid.slice
Environment=HOME=/srv/hermes
WorkingDirectory=/srv/hermes/pluto-shop
ExecStart=/bin/bash /srv/hermes/pluto-shop/infra/dev/deploy.sh
StandardOutput=append:/var/log/pluto-dev-build.log
StandardError=append:/var/log/pluto-dev-build.log
TimeoutStartSec=90min
UNIT
systemctl daemon-reload
systemctl start --no-block pluto-dev-build.service
echo 'Dev build started. Read /var/log/pluto-dev-build.log; production has not been parked.'
