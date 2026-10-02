import os
import stat
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from hermes_system_isolation import (
    PATH_ACCESS_PROBE,
    _probe_paths_inaccessible_as_service,
    check_system_service_isolation,
    protected_paths_for_uid,
)


class HermesSystemIsolationTests(unittest.TestCase):
    def setUp(self):
        self.uid = 997
        self.protected_paths = protected_paths_for_uid(self.uid)
        self.mountinfo = "\n".join(
            f"36 25 0:32 / /{path.lstrip('/')} ro,nosuid,nodev - tmpfs /run/systemd/inaccessible/dir ro"
            for path in self.protected_paths
        )
        self.properties = (
            "ActiveState=active\n"
            "User=hermes\n"
            "MainPID=1234\n"
            f"InaccessiblePaths={' '.join(self.protected_paths)}\n"
        )

    def run_systemctl(self, command, **_kwargs):
        return subprocess.CompletedProcess(command, 0, stdout=self.properties, stderr="")

    def read_process_file(self, pid, name):
        self.assertEqual(pid, 1234)
        if name == "mountinfo":
            return self.mountinfo
        if name == "status":
            return "Name:\tpython\nUid:\t997\t997\t997\t997\n"
        return None

    def check(self, *, run=None, read_process_file=None, probe_paths=None):
        return check_system_service_isolation(
            uid=self.uid,
            service_uid=self.uid,
            run=run or self.run_systemctl,
            read_process_file=read_process_file or self.read_process_file,
            probe_paths=probe_paths or (lambda _pid, _paths: True),
        )

    def test_passes_only_with_active_hermes_process_and_protected_mounts(self):
        checks = self.check()

        self.assertTrue(all(checks.values()))

    def test_rejects_service_running_as_another_user(self):
        def wrong_user(command, **_kwargs):
            output = self.properties.replace("User=hermes", "User=root")
            return subprocess.CompletedProcess(command, 0, stdout=output, stderr="")

        checks = self.check(run=wrong_user)

        self.assertFalse(checks["service_user"])

    def test_rejects_process_without_mounts_even_when_directive_is_configured(self):
        checks = self.check(
            read_process_file=lambda _pid, name: "Uid:\t997\t997\t997\t997\n"
            if name == "status"
            else ""
        )

        self.assertFalse(checks["protected_mounts"])

    def test_rejects_ordinary_mounts_when_the_service_can_access_protected_paths(self):
        ordinary_mountinfo = "\n".join(
            f"36 25 0:32 / /{path.lstrip('/')} rw,nosuid,nodev - ext4 /dev/vda1 rw"
            for path in self.protected_paths
        )
        checks = self.check(
            read_process_file=lambda _pid, name: (
                ordinary_mountinfo if name == "mountinfo" else "Uid:\t997\t997\t997\t997\n"
            ),
            probe_paths=lambda _pid, _paths: False,
        )

        self.assertTrue(checks["protected_mounts"])
        self.assertFalse(checks["protected_paths_inaccessible"])

    def test_rejects_process_with_wrong_effective_uid(self):
        def wrong_uid(_pid, name):
            if name == "mountinfo":
                return self.mountinfo
            return "Uid:\t0\t0\t0\t0\n"

        checks = self.check(read_process_file=wrong_uid)

        self.assertFalse(checks["process_user"])

    def test_rejects_inactive_service(self):
        def inactive(command, **_kwargs):
            output = self.properties.replace("ActiveState=active", "ActiveState=inactive")
            return subprocess.CompletedProcess(command, 0, stdout=output, stderr="")

        checks = self.check(run=inactive)

        self.assertFalse(checks["service_active"])

    def test_access_probe_enters_live_mount_namespace_as_hermes(self):
        commands = []

        def successful_probe(command, **_kwargs):
            commands.append(command)
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

        with patch("hermes_system_isolation.shutil.which", side_effect=lambda name: f"/usr/bin/{name}"):
            self.assertTrue(
                _probe_paths_inaccessible_as_service(
                    1234, self.protected_paths, run=successful_probe
                )
            )

        self.assertEqual(len(commands), 1)
        self.assertIn("--mount", commands[0])
        self.assertIn("/usr/bin/runuser", commands[0])
        self.assertIn("--user=hermes", commands[0])
        self.assertEqual(tuple(commands[0][-len(self.protected_paths):]), self.protected_paths)

    def test_access_probe_fails_closed_if_namespace_tools_are_unavailable(self):
        with patch("hermes_system_isolation.shutil.which", return_value=None):
            self.assertFalse(
                _probe_paths_inaccessible_as_service(1234, self.protected_paths)
            )

    def run_path_access_probe(self, file_mode, allowed_modes):
        with (
            patch("os.stat", return_value=SimpleNamespace(st_mode=file_mode)),
            patch("os.access", side_effect=lambda _path, mode: mode in allowed_modes),
            patch("sys.argv", ["probe", "/protected/path"]),
        ):
            try:
                exec(PATH_ACCESS_PROBE, {})
            except SystemExit as result:
                return result.code
        self.fail("Path probe did not exit")

    def test_path_probe_rejects_execute_only_directory(self):
        status = self.run_path_access_probe(stat.S_IFDIR | 0o111, {os.X_OK})

        self.assertEqual(status, 1)

    def test_path_probe_rejects_write_only_file(self):
        status = self.run_path_access_probe(stat.S_IFREG | 0o200, {os.W_OK})

        self.assertEqual(status, 1)


if __name__ == "__main__":
    unittest.main()
