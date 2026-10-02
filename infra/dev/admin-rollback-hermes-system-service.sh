#!/usr/bin/env bash
# Run with sudo to restore the preserved per-user Hermes gateway.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$src" == /opt/pluto-dev-ops && -O "$src/admin-rollback-hermes-system-service.sh" ]] || { echo 'Run the root-owned rollback helper from /opt/pluto-dev-ops.' >&2; exit 1; }
fail() { echo "$1" >&2; exit 1; }
assert_root_owned_directory() {
    local directory="$1" expected_mode="$2" owner_mode
    [[ ! -L "$directory" ]] || fail "Refusing symlinked protected directory: $directory"
    [[ -d "$directory" ]] || fail "Protected directory is missing: $directory"
    owner_mode="$(stat -c '%u:%g:%a' -- "$directory")"
    [[ "$owner_mode" == "0:0:$expected_mode" ]] || fail "Protected directory must be root:root mode $expected_mode: $directory"
}
assert_root_owned_directory /opt/pluto-dev-ops 755
assert_root_owned_directory /var/lib/pluto-dev-backup 755
assert_root_owned_directory /var/lib/pluto-dev-backup/private 700
mode=restore-user
case "${1:-}" in
    "") ;;
    --leave-user-stopped) mode=leave-user-stopped ;;
    *) fail 'Unknown rollback mode.' ;;
esac

system_unit=/etc/systemd/system/hermes-gateway.service
state_file=/var/lib/pluto-dev-backup/private/hermes-gateway-migration-state
marker='# Managed by PlutoShop Hermes Dev isolation bootstrap.'
[[ ! -L "$state_file" && -f "$state_file" ]] || fail 'Hermes service migration state is missing or unsafe.'
state_owner_mode="$(stat -c '%u:%g:%a' -- "$state_file")"
[[ "$state_owner_mode" == "0:0:600" ]] || fail 'Hermes service migration state must be root-owned mode 600.'
if [[ -e "$system_unit" || -L "$system_unit" ]]; then
    [[ ! -L "$system_unit" && -f "$system_unit" ]] || fail 'System Hermes service unit is not a regular file.'
    grep -qxF "$marker" "$system_unit" || fail 'System Hermes unit is not managed by this setup.'
fi
user_was_active="$(sed -n 's/^user_was_active=//p' "$state_file")"
user_was_enabled="$(sed -n 's/^user_was_enabled=//p' "$state_file")"
[[ "$user_was_active" == yes || "$user_was_active" == no ]] || { echo 'Invalid saved service state.' >&2; exit 1; }
[[ "$user_was_enabled" == yes || "$user_was_enabled" == no ]] || { echo 'Invalid saved service state.' >&2; exit 1; }
uid="$(id -u hermes)"
userctl=(runuser -u hermes -- env HOME=/srv/hermes XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user)

if systemctl is-active --quiet hermes-gateway.service; then
    [[ -f "$system_unit" ]] || fail "Active Hermes system service has no managed unit file."
    systemctl stop hermes-gateway.service
fi
if systemctl is-active --quiet hermes-gateway.service; then
    fail 'Hermes system service remains active; preserving the migration unit and not starting the user gateway.'
fi
if [[ -f "$system_unit" ]]; then
    systemctl disable hermes-gateway.service
    rm -f "$system_unit"
    systemctl daemon-reload
fi
if [[ "$mode" == leave-user-stopped ]]; then
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        "${userctl[@]}" stop hermes-gateway.service
    fi
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        fail 'The original Hermes user service remains active; no gateway was restarted.'
    fi
    if "${userctl[@]}" is-enabled --quiet hermes-gateway.service; then
        "${userctl[@]}" disable hermes-gateway.service
    fi
    echo 'Hermes gateways are stopped and disabled after failed isolation verification; manual recovery is required.'
    exit 0
fi
if [[ "$user_was_enabled" == yes ]]; then
    "${userctl[@]}" enable hermes-gateway.service
else
    "${userctl[@]}" disable hermes-gateway.service
fi
if [[ "$user_was_active" == yes ]]; then
    if ! "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        "${userctl[@]}" start hermes-gateway.service
    fi
    "${userctl[@]}" is-active --quiet hermes-gateway.service
else
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        "${userctl[@]}" stop hermes-gateway.service
    fi
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        fail 'The original Hermes user service remains active unexpectedly.'
    fi
fi
echo 'Restored the original per-user Hermes gateway. Its prior user-service sandbox did not isolate Production; verify isolation before granting Hermes Dev access.'
