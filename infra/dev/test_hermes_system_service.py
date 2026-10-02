import unittest

from hermes_system_service import render_system_service


class HermesSystemServiceTests(unittest.TestCase):
    def test_renders_unprivileged_system_unit_with_protected_paths(self):
        unit = """[Unit]
Description=Hermes
[Service]
ExecStart=/srv/hermes/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run
Restart=always
"""

        rendered = render_system_service(unit, 997)

        self.assertIn("User=hermes", rendered)
        self.assertIn("Group=hermes", rendered)
        self.assertIn("ExecStart=/srv/hermes/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run", rendered)
        self.assertIn("DOCKER_HOST=unix:///run/user/997/docker.sock", rendered)
        self.assertIn("ReadWritePaths=/srv/hermes /run/user/997/docker.sock", rendered)
        self.assertIn(
            "InaccessiblePaths=/var/run/docker.sock /opt/pluto-shop /etc/pluto-dev-backup.env /var/lib/pluto-dev-backup /run/user/997/bus",
            rendered,
        )
        self.assertNotIn("PrivateUsers=", rendered)
        self.assertNotIn("ProtectHome=true", rendered)

    def test_does_not_copy_environment_values_from_the_user_unit(self):
        unit = """[Service]
ExecStart=/srv/hermes/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run
Environment=TELEGRAM_BOT_TOKEN=must-not-leak
"""

        rendered = render_system_service(unit, 997)

        self.assertNotIn("must-not-leak", rendered)
        self.assertNotIn("TELEGRAM_BOT_TOKEN", rendered)

    def test_rejects_an_unrecognized_user_gateway_command(self):
        unit = """[Service]
ExecStart=/bin/bash -c something
"""

        with self.assertRaises(ValueError):
            render_system_service(unit, 997)

    def test_rejects_an_invalid_uid(self):
        unit = """[Service]
ExecStart=/srv/hermes/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run
"""

        with self.assertRaises(ValueError):
            render_system_service(unit, 0)


if __name__ == "__main__":
    unittest.main()
