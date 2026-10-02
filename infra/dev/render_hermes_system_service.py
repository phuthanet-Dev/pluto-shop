#!/usr/bin/env python3
"""Render a root-managed Hermes Dev gateway unit without copying secrets."""

from pathlib import Path
import sys

from hermes_system_service import render_system_service


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: render_hermes_system_service.py USER_UNIT HERMES_UID", file=sys.stderr)
        return 2

    try:
        user_unit = Path(sys.argv[1]).read_text(encoding="utf-8")
        uid = int(sys.argv[2])
        rendered = render_system_service(user_unit, uid)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
