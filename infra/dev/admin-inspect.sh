#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run with sudo.'; exit 1; }
id hermes
for pid in $(pgrep -u hermes -x hermes || true); do
    printf 'Hermes pid=%s executable=' "$pid"
    readlink "/proc/$pid/exe"
    printf 'Working directory: '
    readlink "/proc/$pid/cwd"
    cat "/proc/$pid/cgroup"
done
find /srv/hermes -maxdepth 4 -type f \( -name '*gateway*.service' -o -name 'hermes.service' -o -name 'config.yaml' \) -printf '%p\n'
# Report only whether an allowlist is configured. Do not print tokens or config files.
python3 - <<'PY'
from pathlib import Path
for path in Path('/srv/hermes').glob('**/.env'):
    if len(path.relative_to('/srv/hermes').parts) > 5:
        continue
    text = path.read_text(errors='replace')
    for name in ('TELEGRAM_ALLOWED_USERS', 'TELEGRAM_BOT_TOKEN'):
        rows = [line.split('=', 1)[1].strip().strip("\"'") for line in text.splitlines() if line.startswith(name + '=')]
        print(str(path), name, 'configured' if rows and rows[-1] else 'missing')
PY
systemctl show pluto-shop-backup.service pluto-shop-restore-check.service -p Id -p Result -p ExecMainStatus -p ExecMainExitTimestamp
