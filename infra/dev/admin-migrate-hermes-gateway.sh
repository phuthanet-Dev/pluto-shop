#!/usr/bin/env bash
# Run with sudo to move Hermes into a system-manager filesystem sandbox.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }

src="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$src" == /opt/pluto-dev-ops && -O "$src/admin-migrate-hermes-gateway.sh" ]] || { echo 'Run the root-owned migration helper from /opt/pluto-dev-ops.' >&2; exit 1; }
uid="$(id -u hermes)"
user_unit=/srv/hermes/.config/systemd/user/hermes-gateway.service
system_unit=/etc/systemd/system/hermes-gateway.service
state_file=/var/lib/pluto-dev-backup/private/hermes-gateway-migration-state
marker='# Managed by PlutoShop Hermes Dev isolation bootstrap.'
userctl=(runuser -u hermes -- env HOME=/srv/hermes XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" systemctl --user)

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
verify_saved_migration_state() {
    local owner_mode saved_active saved_enabled
    [[ ! -L "$state_file" && -f "$state_file" ]] || fail 'Managed Hermes service has no safe rollback state.'
    owner_mode="$(stat -c '%u:%g:%a' -- "$state_file")"
    [[ "$owner_mode" == '0:0:600' ]] || fail 'Managed Hermes rollback state must be root-owned mode 600.'
    saved_active="$(sed -n 's/^user_was_active=//p' "$state_file")"
    saved_enabled="$(sed -n 's/^user_was_enabled=//p' "$state_file")"
    [[ "$saved_active" == yes || "$saved_active" == no ]] || fail 'Managed Hermes rollback state is invalid.'
    [[ "$saved_enabled" == yes || "$saved_enabled" == no ]] || fail 'Managed Hermes rollback state is invalid.'
}
[[ -d /srv/hermes/pluto-shop ]] || fail 'Hermes Dev workspace is missing.'
[[ -x "$src/hermes_system_isolation.py" && -O "$src/hermes_system_isolation.py" ]] || fail 'The root-owned Hermes isolation verifier is missing.'
[[ -f "$user_unit" ]] || fail 'Existing Hermes user service is missing; preserve it for manual review.'
[[ -S "/run/user/$uid/docker.sock" ]] || fail 'Hermes rootless Docker socket is unavailable.'
[[ -S "/run/user/$uid/bus" ]] || fail 'Hermes user service manager bus is unavailable.'
[[ -S /var/run/docker.sock ]] || fail 'Production Docker socket is missing; refusing to install an unverifiable mask.'
[[ -d /opt/pluto-shop ]] || fail 'Production workspace is missing; refusing to install an unverifiable mask.'
[[ -f /etc/pluto-dev-backup.env ]] || fail 'Production backup credentials path is missing; refusing to install an unverifiable mask.'
[[ -d /var/lib/pluto-dev-backup/private ]] || fail 'Protected backup state directory is missing.'
groups=" $(id -nG hermes) "
[[ "$groups" != *' sudo '* && "$groups" != *' docker '* ]] || fail 'Hermes must not belong to sudo or the production docker group.'

verify_active_system_service() {
    python3 "$src/hermes_system_isolation.py"
}

if [[ -e "$system_unit" ]]; then
    grep -qxF "$marker" "$system_unit" || fail 'A system Hermes gateway unit already exists and is not managed by this setup.'
    verify_saved_migration_state
    if ! systemctl is-active --quiet hermes-gateway.service; then
        if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
            "${userctl[@]}" stop hermes-gateway.service
        fi
        if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
            fail 'The system gateway is inactive and the previous user gateway could not be stopped.'
        fi
        if "${userctl[@]}" is-enabled --quiet hermes-gateway.service; then
            "${userctl[@]}" disable hermes-gateway.service
        fi
        fail 'Managed system Hermes service is inactive; the previous gateway was left stopped for inspection.'
    fi
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        "${userctl[@]}" stop hermes-gateway.service
    fi
    if "${userctl[@]}" is-active --quiet hermes-gateway.service; then
        fail 'The preserved user gateway remains active; refusing to run two gateways.'
    fi
    if "${userctl[@]}" is-enabled --quiet hermes-gateway.service; then
        "${userctl[@]}" disable hermes-gateway.service
    fi
    if "${userctl[@]}" is-enabled --quiet hermes-gateway.service; then
        fail 'The preserved user gateway remains enabled; refusing a duplicate gateway after reboot.'
    fi
    if ! verify_active_system_service; then
        bash "$src/admin-rollback-hermes-system-service.sh" --leave-user-stopped || fail "Isolation failed and gateway shutdown needs administrator inspection."
        fail 'Isolation verification failed; Hermes gateways were left stopped for administrator inspection.'
    fi
    exit 0
fi

user_was_active=no
user_was_enabled=no
if "${userctl[@]}" is-active --quiet hermes-gateway.service; then user_was_active=yes; fi
if "${userctl[@]}" is-enabled --quiet hermes-gateway.service; then user_was_enabled=yes; fi

unit_tmp="$(mktemp /etc/systemd/system/.hermes-gateway.service.XXXXXX)"
state_tmp="$(mktemp /var/lib/pluto-dev-backup/private/.hermes-gateway-state.XXXXXX)"
migration_started=no
cleanup() { rm -f "$unit_tmp" "$state_tmp"; }
rollback_on_error() {
    local status=$?
    trap - ERR
    if [[ "$migration_started" == yes ]]; then
        set +e
        bash "$src/admin-rollback-hermes-system-service.sh" --leave-user-stopped
        set -e
    fi
    exit "$status"
}
trap cleanup EXIT
trap rollback_on_error ERR

python3 "$src/render_hermes_system_service.py" "$user_unit" "$uid" > "$unit_tmp"
chmod 644 "$unit_tmp"
printf 'user_was_active=%s\nuser_was_enabled=%s\n' "$user_was_active" "$user_was_enabled" > "$state_tmp"
chmod 600 "$state_tmp"
mv -f "$state_tmp" "$state_file"
install -o root -g root -m 644 "$unit_tmp" "$system_unit"
migration_started=yes
systemctl daemon-reload

# Stop the per-user gateway only after the replacement unit has been prepared.
"${userctl[@]}" stop hermes-gateway.service
if [[ "$user_was_enabled" == yes ]]; then
    "${userctl[@]}" disable hermes-gateway.service
fi
systemctl enable --now hermes-gateway.service
systemctl is-active --quiet hermes-gateway.service
verify_active_system_service

migration_started=no
echo 'Hermes gateway now runs as hermes in a system-managed filesystem sandbox.'
echo 'Rollback is available with sudo bash /opt/pluto-dev-ops/admin-rollback-hermes-system-service.sh.'
