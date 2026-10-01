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


def collect_checks(
    *,
    uid: int,
    cwd: Path,
    env: Mapping[str, str],
    run: Callable[..., subprocess.CompletedProcess[str]],
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
            env=docker_env,
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
    if isolation_result is not None:
        checks["production_isolation"] = all(
            protected_path in isolation_result.stdout
            for protected_path in PROTECTED_PATHS
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
