"""Verify Hermes' live system-service filesystem boundary from the root side."""

from __future__ import annotations

from collections.abc import Callable
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

try:
    import pwd
except ImportError:  # The Linux-only command is not invoked by Windows unit tests.
    pwd = None


PROPERTY_COMMAND = [
    "systemctl",
    "show",
    "hermes-gateway.service",
    "--property=ActiveState",
    "--property=User",
    "--property=MainPID",
    "--property=InaccessiblePaths",
    "--no-pager",
]
PROTECTED_PATHS = (
    "/opt/pluto-shop",
    "/var/run/docker.sock",
    "/etc/pluto-dev-backup.env",
    "/var/lib/pluto-dev-backup",
)
CHECK_NAMES = (
    "service_active",
    "service_user",
    "process_user",
    "protected_paths_configured",
    "protected_mounts",
    "protected_paths_inaccessible",
)
COMMAND_TIMEOUT_SECONDS = 10
PATH_ACCESS_PROBE = """
import os
import stat
import sys

for path in sys.argv[1:]:
    try:
        path_mode = os.stat(path).st_mode
    except OSError:
        continue
    access_modes = (
        (os.R_OK, os.W_OK)
        if stat.S_ISSOCK(path_mode)
        else (os.R_OK, os.W_OK, os.X_OK)
    )
    if any(os.access(path, access_mode) for access_mode in access_modes):
        sys.exit(1)
sys.exit(0)
"""


def protected_paths_for_uid(uid: int) -> tuple[str, ...]:
    """Return the Production and user-manager paths the gateway must not see."""
    return (*PROTECTED_PATHS, f"/run/user/{uid}/bus")


def _path_aliases(path: str) -> set[str]:
    aliases = {path}
    if path.startswith("/var/run/"):
        aliases.add(path.replace("/var/run/", "/run/", 1))
    elif path.startswith("/run/"):
        aliases.add(path.replace("/run/", "/var/run/", 1))
    return aliases


def _parse_properties(output: str) -> dict[str, str]:
    properties: dict[str, str] = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            properties[key] = value
    return properties


def _mount_targets(mountinfo: str) -> set[str]:
    targets: set[str] = set()
    for line in mountinfo.splitlines():
        fields = line.split()
        if len(fields) <= 4:
            continue
        target = fields[4]
        for escaped, decoded in (
            (r"\040", " "),
            (r"\011", "\t"),
            (r"\012", "\n"),
            (r"\134", "\\"),
        ):
            target = target.replace(escaped, decoded)
        targets.add(target)
    return targets


def _configured_inaccessible_paths(value: str) -> set[str]:
    paths: set[str] = set()
    for token in value.split():
        # systemd allows a leading '-' to ignore a missing path. Normalize it
        # before comparison; the migration preflight separately requires paths.
        paths.add(token[1:] if token.startswith("-") else token)
    return paths


def _effective_uid(status: str | None) -> int | None:
    if status is None:
        return None
    for line in status.splitlines():
        if line.startswith("Uid:"):
            values = line.split()[1:]
            if len(values) >= 2:
                try:
                    return int(values[1])
                except ValueError:
                    return None
    return None


def _read_process_file(pid: int, name: str) -> str | None:
    try:
        return Path("/proc", str(pid), name).read_text(encoding="utf-8")
    except OSError:
        return None


def _probe_paths_inaccessible_as_service(
    pid: int,
    paths: tuple[str, ...],
    *,
    run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> bool:
    """Try harmless access checks from the live process mount namespace as Hermes."""
    nsenter = shutil.which("nsenter")
    runuser = shutil.which("runuser")
    if nsenter is None or runuser is None:
        return False
    command = [
        nsenter,
        "--target",
        str(pid),
        "--mount",
        "--",
        runuser,
        "--user=hermes",
        "--",
        sys.executable,
        "-c",
        PATH_ACCESS_PROBE,
        *paths,
    ]
    try:
        result = run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def check_system_service_isolation(
    *,
    uid: int,
    service_uid: int,
    run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    read_process_file: Callable[[int, str], str | None] = _read_process_file,
    probe_paths: Callable[[int, tuple[str, ...]], bool] | None = None,
) -> dict[str, bool]:
    """Check manager properties and the live process mounts without exposing values."""
    checks = {name: False for name in CHECK_NAMES}
    try:
        result = run(
            PROPERTY_COMMAND,
            capture_output=True,
            text=True,
            check=False,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return checks
    if result.returncode != 0:
        return checks

    properties = _parse_properties(result.stdout)
    checks["service_active"] = properties.get("ActiveState") == "active"
    checks["service_user"] = properties.get("User") == "hermes"
    configured = _configured_inaccessible_paths(properties.get("InaccessiblePaths", ""))
    checks["protected_paths_configured"] = all(
        not aliases.isdisjoint(configured)
        for aliases in map(_path_aliases, protected_paths_for_uid(uid))
    )

    try:
        pid = int(properties.get("MainPID", "0"))
    except ValueError:
        pid = 0
    if pid <= 1:
        return checks

    checks["process_user"] = _effective_uid(read_process_file(pid, "status")) == service_uid
    mountinfo = read_process_file(pid, "mountinfo")
    if mountinfo is not None:
        mounted = _mount_targets(mountinfo)
        checks["protected_mounts"] = all(
            not aliases.isdisjoint(mounted)
            for aliases in map(_path_aliases, protected_paths_for_uid(uid))
        )
    if (
        checks["service_active"]
        and checks["service_user"]
        and checks["process_user"]
        and checks["protected_paths_configured"]
        and checks["protected_mounts"]
    ):
        access_probe = probe_paths or (
            lambda target_pid, paths: _probe_paths_inaccessible_as_service(
                target_pid, paths, run=run
            )
        )
        checks["protected_paths_inaccessible"] = access_probe(
            pid, protected_paths_for_uid(uid)
        )
    return checks


def main() -> int:
    if os.geteuid() != 0 or pwd is None:
        checks = {name: False for name in CHECK_NAMES}
    else:
        try:
            service_uid = pwd.getpwnam("hermes").pw_uid
        except KeyError:
            service_uid = -1
        checks = check_system_service_isolation(uid=service_uid, service_uid=service_uid)

    for name in CHECK_NAMES:
        print(f"{name}: {'PASS' if checks[name] else 'FAIL'}")
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
