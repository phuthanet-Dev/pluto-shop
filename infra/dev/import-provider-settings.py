#!/usr/bin/env python3
"""Owner-authorized reuse of ONLY SMTP/payment settings; run with sudo."""
import json
import os
import pwd
import shlex
from pathlib import Path

if os.geteuid() != 0:
    raise SystemExit('Run with sudo')
keys = {'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'INWCLOUD_API_KEY'}
values = {}
for line in Path('/opt/pluto-shop/current/.env.production').read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'):
        continue
    key, value = line.split('=', 1)
    if key in keys:
        values[key] = ' '.join(shlex.split(value, comments=True))
if not all(values.get(key) for key in keys):
    raise SystemExit('Some provider settings are missing; configure interactively. No secrets printed.')
if any(any(c in value for c in "'\\\r\n") for value in values.values()):
    raise SystemExit('Unsupported quoting in provider settings; configure interactively.')
user = pwd.getpwnam('hermes')
# Drop privileges before opening an agent-controlled path (including its parents).
os.setgroups([])
os.setgid(user.pw_gid)
os.setuid(user.pw_uid)
os.umask(0o077)
with open('/srv/hermes/dev-control/provider-import.json', 'x') as handle:
    json.dump(values, handle)
print('Provider settings prepared privately for configure.py. No database or production encryption keys copied.')
