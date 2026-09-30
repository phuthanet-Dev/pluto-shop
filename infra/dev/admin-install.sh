#!/usr/bin/env bash
# Run manually with sudo from the reviewed setup checkout. Does not pause production.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run with sudo.'; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$src/../.." && pwd)"
[[ "$(git -c safe.directory="$repo" -C "$repo" branch --show-current)" == codex/linux-dev-environment ]] || { echo 'Use the reviewed setup branch.'; exit 1; }
[[ -z "$(git -c safe.directory="$repo" -C "$repo" status --porcelain)" ]] || { echo 'Setup checkout must be clean.'; exit 1; }
id hermes >/dev/null
if id -nG hermes | tr ' ' '\n' | grep -Eq '^(sudo|docker)$'; then
    echo 'Hermes must not belong to sudo or production docker groups.'; exit 1
fi
apt-get update
NEEDRESTART_MODE=l apt-get install -y --no-upgrade uidmap dbus-user-session slirp4netns restic
if ! command -v dockerd-rootless-setuptool.sh >/dev/null; then
    NEEDRESTART_MODE=l apt-get install -y docker-ce-rootless-extras
fi
# Allocate a free, non-overlapping subordinate ID range; preserve existing mappings.
python3 - <<'PY'
from pathlib import Path
for name in ('subuid','subgid'):
    path=Path('/etc')/name
    rows=[line.split(':') for line in path.read_text().splitlines() if line.strip()]
    existing=[r for r in rows if r[0]=='hermes']
    if existing:
        if sum(int(r[2]) for r in existing)<65536: raise SystemExit('Insufficient existing hermes mapping: '+name)
        continue
    start=max([231072]+[int(r[1])+int(r[2]) for r in rows])
    with path.open('a') as f: f.write(f'hermes:{start}:65536\n')
PY
uid="$(id -u hermes)"
loginctl enable-linger hermes
systemctl start "user@$uid.service"
install -d -m 755 /opt/pluto-dev-ops /var/lib/pluto-dev-backup
install -d -m 700 /var/lib/pluto-dev-backup/private
for file in backup.sh verify-backup.sh pause-production.sh resume-production.sh healthcheck.sh Caddyfile compose.edge.yaml; do
    install -o root -g root -m 644 "$src/$file" "/opt/pluto-dev-ops/$file"
done
install -d -o hermes -g hermes -m 700 /srv/hermes/dev-control
if [[ ! -d /srv/hermes/pluto-shop ]]; then
    # Clone only committed Git content, never local secrets or ignored artifacts.
    git -c safe.directory="$repo" -C "$repo" bundle create /var/lib/pluto-dev-backup/private/setup.bundle codex/linux-dev-environment
    install -o hermes -g hermes -m 600 /var/lib/pluto-dev-backup/private/setup.bundle /srv/hermes/dev-control/setup.bundle
    runuser -u hermes -- git clone -b codex/linux-dev-environment /srv/hermes/dev-control/setup.bundle /srv/hermes/pluto-shop
    chmod 700 /srv/hermes/pluto-shop
    runuser -u hermes -- git -C /srv/hermes/pluto-shop remote set-url origin https://github.com/phuthanet-Dev/pluto-shop.git
else
    echo 'Existing workspace preserved; verify it contains the setup commit before deploying.'
fi
runuser -u hermes -- env HOME=/srv/hermes XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
    dockerd-rootless-setuptool.sh install --force
install -d -m 755 "/etc/systemd/system/user-$uid.slice.d"
printf '[Slice]\nCPUQuota=400%%\nMemoryMax=8G\nTasksMax=4096\n' > "/etc/systemd/system/user-$uid.slice.d/pluto-limits.conf"
systemctl daemon-reload
systemctl set-property "user-$uid.slice" CPUQuota=400% MemoryMax=8G TasksMax=4096
runuser -u hermes -- mkdir -p /srv/hermes/.config/systemd/user/docker.service.d
printf '[Service]\nCPUQuota=300%%\nMemoryMax=6G\nTasksMax=3072\n' > /srv/hermes/.config/systemd/user/docker.service.d/pluto-limits.conf
chown hermes:hermes /srv/hermes/.config/systemd/user/docker.service.d/pluto-limits.conf
runuser -u hermes -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user daemon-reload
runuser -u hermes -- env XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user restart docker
# Backup credentials remain root-only. Reuse ONLY backup settings from the existing deployment.
if [[ ! -e /etc/pluto-dev-backup.env ]]; then
    python3 - <<'PY'
import os, shlex
from pathlib import Path
keys={'RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_DEFAULT_REGION'}
values={}
for line in Path('/opt/pluto-shop/current/.env.production').read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'): continue
    key, value=line.split('=',1)
    if key in keys:
        parsed=shlex.split(value, comments=True)
        values[key]=' '.join(parsed)
if not values.get('RESTIC_REPOSITORY') or not values.get('RESTIC_PASSWORD'): raise SystemExit('Existing backup settings missing')
os.umask(0o077)
with open('/etc/pluto-dev-backup.env','x') as f:
    for key,value in values.items(): f.write(key+'='+shlex.quote(value)+'\n')
PY
fi
cat > /etc/systemd/system/pluto-dev-backup.service <<'UNIT'
[Unit]
Description=Encrypted Phuto dev backup and pre-migration receipt
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/pluto-dev-ops/backup.sh dev
TimeoutStartSec=30min
UMask=0077
Nice=10
UNIT
cat > /etc/systemd/system/pluto-dev-backup.path <<'UNIT'
[Path]
PathChanged=/srv/hermes/dev-control/request
Unit=pluto-dev-backup.service
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/pluto-dev-backup.timer <<'UNIT'
[Timer]
OnCalendar=*-*-* 03:00:00 Asia/Bangkok
Persistent=true
RandomizedDelaySec=300
Unit=pluto-dev-backup.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now pluto-dev-backup.path
cat > /etc/systemd/system/pluto-dev-health.service <<'UNIT'
[Unit]
Description=Phuto parked production and dev health check
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/pluto-dev-ops/healthcheck.sh
TimeoutStartSec=120
UNIT
cat > /etc/systemd/system/pluto-dev-health.timer <<'UNIT'
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=pluto-dev-health.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
# Daily timer is enabled after first successful dev deployment (database must exist).
bash "$src/admin-inspect.sh"
echo 'Installed. Production is unchanged. Next: configure dev credentials and verify the existing Telegram allowlist.'
