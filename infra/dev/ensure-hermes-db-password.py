#!/usr/bin/env python3
"""Create the one-time Hermes Dev database password without rotating existing values."""

from __future__ import annotations

import os
from pathlib import Path
import re
import secrets
import tempfile

PASSWORD_KEY = "POSTGRES_HERMES_PASSWORD"
ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?POSTGRES_HERMES_PASSWORD\s*=(.*)$")


def _nonempty_shell_value(raw_value: str) -> bool:
    value = raw_value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    return bool(value) and not value.startswith("replace-with-")


def ensure_password(path: Path, *, password_factory=secrets.token_urlsafe) -> bool:
    """Add a missing/empty password atomically. Return whether content changed."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("Dev environment file must be a regular file.")

    os.chmod(path, 0o600)
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    matches = [index for index, line in enumerate(lines) if ASSIGNMENT.match(line)]

    if len(matches) > 1:
        raise ValueError("Dev environment contains duplicate Hermes database password entries.")

    if matches and _nonempty_shell_value(ASSIGNMENT.match(lines[matches[0]]).group(1)):
        return False

    password = password_factory(48)
    if not isinstance(password, str) or not password or any(char in password for char in "'\\\r\n"):
        raise ValueError("Generated Hermes database password is not shell-safe.")

    new_line = f"{PASSWORD_KEY}='{password}'\n"
    if matches:
        old_line = lines[matches[0]]
        ending = "\r\n" if old_line.endswith("\r\n") else "\n"
        lines[matches[0]] = new_line.rstrip("\n") + ending
    else:
        if lines and not lines[-1].endswith(("\n", "\r")):
            lines[-1] += "\n"
        lines.append(new_line)

    descriptor, temporary_name = tempfile.mkstemp(prefix=".env.dev-server.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as output:
            output.writelines(lines)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, path)
        os.chmod(path, 0o600)
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
    return True


def _require_hermes_account() -> None:
    if os.name == "posix":
        import pwd

        if pwd.getpwuid(os.getuid()).pw_name != "hermes":
            raise SystemExit("Run as hermes.")


def main() -> int:
    _require_hermes_account()
    environment_file = Path(__file__).resolve().parents[2] / ".env.dev-server"
    changed = ensure_password(environment_file)
    print(
        "Created the Hermes Dev database credential."
        if changed
        else "Hermes Dev database credential is ready."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
