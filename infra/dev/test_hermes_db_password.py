import contextlib
import io
import os
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import call, Mock, patch


SCRIPT_PATH = Path(__file__).with_name("ensure-hermes-db-password.py")
SPEC = importlib.util.spec_from_file_location("ensure_hermes_db_password", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HermesDatabasePasswordTests(unittest.TestCase):
    def test_existing_password_and_runtime_values_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.dev-server"
            original = (
                "POSTGRES_DB='plutoshop_dev'\n"
                "POSTGRES_PASSWORD='owner-value'\n"
                "POSTGRES_HERMES_PASSWORD='keep-this-password'\n"
                "INWCLOUD_API_KEY='provider-value'\n"
            )
            path.write_text(original, encoding="utf-8")
            path.chmod(0o600)
            generator = Mock(return_value="new-password")

            with patch.object(MODULE.os, "chmod", wraps=os.chmod) as chmod:
                changed = MODULE.ensure_password(path, password_factory=generator)
            self.assertIn(call(path, 0o600), chmod.call_args_list)

            self.assertFalse(changed)
            generator.assert_not_called()
            self.assertEqual(path.read_text(encoding="utf-8"), original)
            if os.name == "posix":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_missing_password_is_generated_once_without_changing_existing_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.dev-server"
            original = "POSTGRES_DB='plutoshop_dev'\nSMTP_PASSWORD='smtp-value'\n"
            path.write_text(original, encoding="utf-8")
            path.chmod(0o600)
            generator = Mock(return_value="generated-hermes-password")

            with patch.object(MODULE.os, "chmod", wraps=os.chmod) as chmod:
                first_changed = MODULE.ensure_password(path, password_factory=generator)
            self.assertIn(call(path, 0o600), chmod.call_args_list)
            generated_file = path.read_text(encoding="utf-8")
            second_changed = MODULE.ensure_password(
                path, password_factory=Mock(return_value="rotated-value")
            )

            self.assertTrue(first_changed)
            self.assertFalse(second_changed)
            generator.assert_called_once()
            self.assertTrue(generated_file.startswith(original))
            self.assertIn("POSTGRES_HERMES_PASSWORD='generated-hermes-password'\n", generated_file)
            self.assertEqual(path.read_text(encoding="utf-8"), generated_file)
            if os.name == "posix":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_empty_password_is_replaced_and_secret_is_not_printed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.dev-server"
            path.write_text(
                "POSTGRES_DB='plutoshop_dev'\nPOSTGRES_HERMES_PASSWORD=''\n",
                encoding="utf-8",
            )
            path.chmod(0o600)

            captured = io.StringIO()
            with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
                MODULE.ensure_password(path, password_factory=lambda _size: "hidden-generated-value")

            self.assertNotIn("hidden-generated-value", captured.getvalue())
            self.assertIn(
                "POSTGRES_HERMES_PASSWORD='hidden-generated-value'",
                path.read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()
