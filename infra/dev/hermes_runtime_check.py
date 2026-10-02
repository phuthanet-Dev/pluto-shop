#!/usr/bin/env python3
"""Report Hermes Dev runtime checks without exposing configuration or command output."""

from __future__ import annotations

from collections.abc import Callable, Mapping
import getpass
import os
from pathlib import Path
import subprocess
import sys
import tempfile

try:
    import pwd
except ImportError:  # Windows unit tests do not provide the Unix account database.
    pwd = None


EXPECTED_WORKSPACE = Path("/srv/hermes/pluto-shop")
PROTECTED_PATHS = (
    "/opt/pluto-shop",
    "/var/run/docker.sock",
    "/etc/pluto-dev-backup.env",
)
CHECK_NAMES = (
    "effective_user",
    "workspace",
    "git_root",
    "workspace_write",
    "docker_host",
    "rootless_docker",
    "dev_compose",
    "production_isolation",
)
COMMAND_TIMEOUT_SECONDS = 15


def _username_for_uid(uid: int) -> str:
    if pwd is not None:
        try:
            return pwd.getpwuid(uid).pw_name
        except KeyError:
            return ""
    return getpass.getuser()


def _run(
    run: Callable[..., subprocess.CompletedProcess[str]],
    command: list[str],
    *,
    cwd: Path,
    env: Mapping[str, str],
) -> subprocess.CompletedProcess[str] | None:
    try:
        result = run(
            command,
            cwd=str(cwd),
            env=dict(env),
            capture_output=True,
            text=True,
            check=False,
            timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result if result.returncode == 0 else None


def _workspace_write_probe(workspace: Path) -> bool:
    descriptor = None
    probe_path = None
    try:
        descriptor, raw_path = tempfile.mkstemp(
            prefix=".hermes-runtime-check-", dir=str(workspace)
        )
        probe_path = Path(raw_path)
        os.close(descriptor)
        descriptor = None
        probe_path.unlink()
        probe_path = None
        return True
    except OSError:
        return False
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        if probe_path is not None:
            try:
                probe_path.unlink(missing_ok=True)
            except OSError:
                pass


def _read_mountinfo(pid: int) -> str | None:
    """Read mount targets from one process namespace without reading app data."""
    try:
        return Path("/proc", str(pid), "mountinfo").read_text(encoding="utf-8")
    except OSError:
        return None


def _mountinfo_hides_protected_paths(mountinfo: str) -> bool:
    """Require inaccessible-path mounts in the active gateway process."""
    mounted_targets: set[str] = set()
    for line in mountinfo.splitlines():
        fields = line.split()
        if len(fields) > 4:
            target = fields[4]
            for escaped, decoded in (
                (r"\040", " "),
                (r"\011", "\t"),
                (r"\012", "\n"),
                (r"\134", "\\"),
            ):
                target = target.replace(escaped, decoded)
            mounted_targets.add(target)

    for protected_path in PROTECTED_PATHS:
        aliases = {protected_path}
        if protected_path.startswith("/var/run/"):
            aliases.add(protected_path.replace("/var/run/", "/run/", 1))
        if aliases.isdisjoint(mounted_targets):
            return False
    return True


def collect_checks(
    *,
    uid: int,
    cwd: Path,
    env: Mapping[str, str],
    run: Callable[..., subprocess.CompletedProcess[str]],
    read_mountinfo: Callable[[int], str | None] = _read_mountinfo,
) -> dict[str, bool]:
    """Collect fixed pass/fail checks; subprocess details and values stay private."""
    try:
        current_workspace = cwd.resolve()
        expected_workspace = EXPECTED_WORKSPACE.resolve()
    except OSError:
        current_workspace = Path()
        expected_workspace = EXPECTED_WORKSPACE

    workspace_ok = current_workspace == expected_workspace
    checks = {name: False for name in CHECK_NAMES}
    checks["effective_user"] = _username_for_uid(uid) == "hermes"
    checks["workspace"] = workspace_ok

    git_result = _run(
        run,
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        cwd=current_workspace,
        env=env,
    )
    if git_result is not None:
        try:
            checks["git_root"] = Path(git_result.stdout.strip()).resolve() == expected_workspace
        except OSError:
            checks["git_root"] = False

    if workspace_ok:
        checks["workspace_write"] = _workspace_write_probe(current_workspace)

    expected_docker_host = f"unix:///run/user/{uid}/docker.sock"
    docker_host_ok = env.get("DOCKER_HOST") == expected_docker_host and not env.get("DOCKER_CONTEXT")
    checks["docker_host"] = docker_host_ok
    docker_env = dict(env)

    if docker_host_ok and checks["effective_user"]:
        docker_result = _run(
            run,
            ["docker", "info", "--format", "{{json .SecurityOptions}}"],
            cwd=current_workspace,
            env=docker_env,
        )
        checks["rootless_docker"] = (
            docker_result is not None and "rootless" in docker_result.stdout.lower()
        )
        # deploy.sh creates this credential before running Compose validation.
        # Validate interpolation without generating or reading it in the probe.
        compose_env = dict(docker_env)
        compose_env["POSTGRES_HERMES_PASSWORD"] = "runtime-check-only"
        compose_result = _run(
            run,
            [
                "docker",
                "compose",
                "--env-file",
                ".env.dev-server",
                "-f",
                "compose.dev-server.yaml",
                "config",
                "--quiet",
            ],
            cwd=current_workspace,
            env=compose_env,
        )
        checks["dev_compose"] = compose_result is not None

    isolation_result = _run(
        run,
        [
            "systemctl",
            "--user",
            "show",
            "hermes-gateway",
            "--property=InaccessiblePaths",
            "--value",
        ],
        cwd=current_workspace,
        env=env,
    )
    private_users_result = _run(
        run,
        [
            "systemctl",
            "--user",
            "show",
            "hermes-gateway",
            "--property=PrivateUsers",
            "--value",
        ],
        cwd=current_workspace,
        env=env,
    )
    private_users_enabled = (
        private_users_result is not None
        and private_users_result.stdout.strip().lower() in {"yes", "true"}
    )
    if isolation_result is not None and private_users_enabled:
        configured_paths = all(
            protected_path in isolation_result.stdout
            for protected_path in PROTECTED_PATHS
        )
        main_pid_result = _run(
            run,
            [
                "systemctl",
                "--user",
                "show",
                "hermes-gateway",
                "--property=MainPID",
                "--value",
            ],
            cwd=current_workspace,
            env=env,
        )
        try:
            main_pid = int(main_pid_result.stdout.strip()) if main_pid_result is not None else 0
        except ValueError:
            main_pid = 0
        if configured_paths and main_pid > 0:
            mountinfo = read_mountinfo(main_pid)
            checks["production_isolation"] = (
                mountinfo is not None and _mountinfo_hides_protected_paths(mountinfo)
            )

    return checks


def render_report(checks: Mapping[str, bool]) -> str:
    """Render only fixed check names and pass/fail; ignore unknown keys."""
    return "\n".join(
        f"{name}: {'PASS' if checks.get(name, False) else 'FAIL'}"
        for name in CHECK_NAMES
    )


def main() -> int:
    checks = collect_checks(
        uid=os.geteuid(),
        cwd=Path.cwd(),
        env=os.environ,
        run=subprocess.run,
    )
    print(render_report(checks))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
