import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import hermes_runtime_check as runtime_check


class HermesRuntimeCheckTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.workspace = Path(self.temporary_directory.name)
        self.environment = {
            "DOCKER_HOST": "unix:///run/user/997/docker.sock",
            "TELEGRAM_BOT_TOKEN": "runtime-check-sentinel-secret",
        }
        self.isolation_output = (
            "-/opt/pluto-shop -/var/run/docker.sock "
            "-/etc/pluto-dev-backup.env"
        )
        self.isolation_mountinfo = "\n".join(
            f"36 25 0:32 / /{path.lstrip('/')} ro,nosuid,nodev - tmpfs /run/systemd/inaccessible/dir ro"
            for path in runtime_check.PROTECTED_PATHS
        )

    def successful_process(self, command, **_kwargs):
        if command[0] == "git":
            output = str(self.workspace)
        elif command[0] == "docker" and command[1] == "info":
            output = '["name=rootless"]'
        elif command[0] == "systemctl" and "--property=MainPID" in command:
            output = "1234"
        elif command[0] == "systemctl":
            output = self.isolation_output
        else:
            output = ""
        return subprocess.CompletedProcess(command, 0, stdout=output, stderr="")

    def collect(self, *, environment=None, run=None, cwd=None, uid=997):
        with (
            patch.object(runtime_check, "EXPECTED_WORKSPACE", self.workspace),
            patch.object(runtime_check, "_username_for_uid", return_value="hermes"),
        ):
            return runtime_check.collect_checks(
                uid=uid,
                cwd=cwd or self.workspace,
                env=self.environment if environment is None else environment,
                run=run or self.successful_process,
                read_mountinfo=lambda _pid: self.isolation_mountinfo,
            )

    def test_passes_expected_workspace_and_rootless_socket(self):
        checks = self.collect()

        self.assertTrue(checks["effective_user"])
        self.assertTrue(checks["workspace"])
        self.assertTrue(checks["git_root"])
        self.assertTrue(checks["docker_host"])
        self.assertTrue(checks["rootless_docker"])
        self.assertTrue(checks["dev_compose"])
        self.assertTrue(checks["production_isolation"])

    def test_reports_wrong_workspace(self):
        checks = self.collect(cwd=self.workspace / "elsewhere")

        self.assertFalse(checks["workspace"])

    def test_reports_missing_or_wrong_docker_host(self):
        for environment in ({}, {"DOCKER_HOST": "unix:///var/run/docker.sock"}):
            with self.subTest(environment=environment):
                checks = self.collect(environment=environment)
                self.assertFalse(checks["docker_host"])
                self.assertFalse(checks["rootless_docker"])
                self.assertFalse(checks["dev_compose"])

    def test_dev_compose_validation_uses_non_secret_operator_password_placeholder(self):
        compose_passwords = []

        def record_compose_environment(command, **kwargs):
            if command[:2] == ["docker", "compose"]:
                compose_passwords.append(kwargs["env"].get("POSTGRES_HERMES_PASSWORD"))
            return self.successful_process(command, **kwargs)

        checks = self.collect(run=record_compose_environment)

        self.assertTrue(checks["dev_compose"])
        self.assertEqual(compose_passwords, ["runtime-check-only"])

    def test_reports_docker_permission_failure(self):
        def denied_process(command, **_kwargs):
            if command[0] == "docker":
                raise PermissionError("socket denied")
            return self.successful_process(command)

        checks = self.collect(run=denied_process)

        self.assertFalse(checks["rootless_docker"])

    def test_workspace_write_probe(self):
        checks = self.collect()

        self.assertTrue(checks["workspace_write"])
        self.assertEqual(list(self.workspace.glob(".hermes-runtime-check-*")), [])

    def test_report_never_contains_environment_values(self):
        sentinel = self.environment["TELEGRAM_BOT_TOKEN"]

        def noisy_process(command, **kwargs):
            result = self.successful_process(command, **kwargs)
            result.stdout = f"{result.stdout} {sentinel}"
            result.stderr = sentinel
            return result

        checks = self.collect(run=noisy_process)
        report = runtime_check.render_report(checks)

        self.assertNotIn(sentinel, report)
        self.assertNotIn(self.environment["DOCKER_HOST"], report)
        self.assertTrue(all(line.endswith(("PASS", "FAIL")) for line in report.splitlines()))

    def test_production_isolation_requires_an_active_service_process(self):
        def inactive_process(command, **kwargs):
            if command[0] == "systemctl" and "--property=MainPID" in command:
                return subprocess.CompletedProcess(command, 0, stdout="0", stderr="")
            return self.successful_process(command, **kwargs)

        checks = self.collect(run=inactive_process)

        self.assertFalse(checks["production_isolation"])

    def test_production_isolation_requires_mounts_in_the_active_process(self):
        stale_mountinfo = self.isolation_mountinfo.replace("/opt/pluto-shop", "/old/opt/pluto-shop")

        checks = runtime_check.collect_checks(
            uid=997,
            cwd=self.workspace,
            env=self.environment,
            run=self.successful_process,
            read_mountinfo=lambda _pid: stale_mountinfo,
        )

        self.assertFalse(checks["production_isolation"])

    def test_systemd_resolved_run_alias_satisfies_docker_socket_isolation(self):
        mountinfo = self.isolation_mountinfo.replace(
            "/var/run/docker.sock", "/run/docker.sock"
        )

        self.assertTrue(runtime_check._mountinfo_hides_protected_paths(mountinfo))


if __name__ == "__main__":
    unittest.main()
