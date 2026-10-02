"""Render the root-managed Hermes gateway unit from the reviewed user unit."""

from __future__ import annotations

import configparser
import shlex


_EXPECTED_ARGUMENTS = ["-m", "hermes_cli.main", "gateway", "run"]
_EXECUTABLE = "/srv/hermes/.hermes/hermes-agent/venv/bin/python"


def render_system_service(user_unit: str, uid: int) -> str:
    """Create a restricted system service while preserving the installed entrypoint."""
    if uid <= 0:
        raise ValueError("Hermes UID must be a non-root account")

    config = configparser.RawConfigParser(strict=False)
    try:
        config.read_string(user_unit)
        command = shlex.split(config.get("Service", "ExecStart"))
    except (configparser.Error, KeyError, ValueError) as error:
        raise ValueError("Could not read the installed Hermes gateway command") from error

    if (
        len(command) != len(_EXPECTED_ARGUMENTS) + 1
        or command[0] != _EXECUTABLE
        or command[1:] != _EXPECTED_ARGUMENTS
    ):
        raise ValueError("Unrecognized Hermes gateway command; preserve it for manual review")

    return f"""# Managed by PlutoShop Hermes Dev isolation bootstrap.
[Unit]
Description=Hermes Agent Gateway (Pluto Dev)
Wants=network-online.target
After=network-online.target user@{uid}.service
Requires=user@{uid}.service

[Service]
Type=simple
User=hermes
Group=hermes
WorkingDirectory=/srv/hermes/pluto-shop
Environment=HOME=/srv/hermes
Environment=HERMES_HOME=/srv/hermes/.hermes
Environment=HERMES_WRITE_SAFE_ROOT=/srv/hermes/pluto-shop
Environment=DOCKER_HOST=unix:///run/user/{uid}/docker.sock
Environment=XDG_RUNTIME_DIR=/run/user/{uid}
Environment=PATH=/srv/hermes/.local/bin:/srv/hermes/.hermes/hermes-agent/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart={' '.join(command)}
Restart=always
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/hermes /run/user/{uid}/docker.sock
InaccessiblePaths=/var/run/docker.sock /opt/pluto-shop /etc/pluto-dev-backup.env /var/lib/pluto-dev-backup /run/user/{uid}/bus
CPUQuota=100%
MemoryMax=1G
TasksMax=512

[Install]
WantedBy=multi-user.target
"""
