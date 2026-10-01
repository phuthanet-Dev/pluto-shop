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

    def successful_process(self, command, **_kwargs):
        if command[0] == "git":
            output = str(self.workspace)
        elif command[0] == "docker" and command[1] == "info":
            output = '["name=rootless"]'
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


if __name__ == "__main__":
    unittest.main()
