#!/usr/bin/env bash
set -Eeuo pipefail
test -f /var/lib/pluto-dev-backup/dev-snapshot
age=$(( $(date +%s) - $(stat -c %Y /var/lib/pluto-dev-backup/dev-snapshot) ))
(( age < 129600 )) || { echo 'Dev backup is older than 36 hours.' >&2; exit 1; }
for host in phutoshop.com auth.phutoshop.com; do
    [[ "$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "https://$host/")" == 503 ]]
done
curl -fsS --max-time 20 https://dev.phutoshop.com/th >/dev/null
curl -fsS --max-time 20 https://auth-dev.phutoshop.com/realms/pluto/.well-known/openid-configuration |
    python3 -c 'import json,sys; assert json.load(sys.stdin)["issuer"] == "https://auth-dev.phutoshop.com/realms/pluto"'
echo 'Maintenance and dev endpoints healthy.'
