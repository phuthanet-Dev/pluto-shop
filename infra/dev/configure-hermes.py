#!/usr/bin/env python3
"""Run as hermes. Keep the existing gateway executable, token and model config."""
import configparser
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess

if os.getuid() == 0:
    raise SystemExit('Run as hermes, not root')
home = Path('/srv/hermes')
unit = home / '.config/systemd/user/hermes-gateway.service'
config = configparser.RawConfigParser(strict=False)
config.read(unit)
command = shlex.split(config['Service']['ExecStart'])
if 'gateway' not in command:
    raise SystemExit('Unrecognized gateway entrypoint; preserve service and inspect manually')
cli = command[:command.index('gateway')]
if not cli or not Path(cli[0]).is_absolute():
    raise SystemExit('Gateway executable must be an absolute path')
envfile = home / '.hermes/.env'
values = {}
for line in envfile.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key] = ' '.join(shlex.split(value, comments=True))
allowed = values.get('TELEGRAM_ALLOWED_USERS', '')
if not re.fullmatch(r'\d+', allowed):
    raise SystemExit('Expected exactly one numeric owner Telegram ID. Review the existing allowlist locally before continuing.')
if not values.get('TELEGRAM_BOT_TOKEN'):
    raise SystemExit('Existing Telegram token missing')
os.umask(0o077)
for path in (envfile, home / '.hermes/config.yaml', unit):
    saved = path.with_name(path.name + '.before-pluto-dev')
    if not saved.exists():
        shutil.copy2(path, saved)
        saved.chmod(0o600)
environment = dict(os.environ, HOME=str(home), HERMES_HOME=str(home / '.hermes'))
subprocess.run(cli + ['--version'], env=environment, check=True)
for key, value in (
    ('terminal.backend', 'local'), ('terminal.cwd', '/srv/hermes/pluto-shop'),
):
    subprocess.run(cli + ['config', 'set', key, value], env=environment, check=True)
# Older installed versions route unknown uppercase config keys into YAML, not .env.
# Update only these non-secret environment controls; preserve token and allowlist.
controls = {
    'GATEWAY_ALLOW_ALL_USERS': 'false',
    'TELEGRAM_ALLOW_ALL_USERS': 'false',
    'DOCKER_HOST': f'unix:///run/user/{os.getuid()}/docker.sock',
    'HERMES_WRITE_SAFE_ROOT': '/srv/hermes/pluto-shop',
}
lines = [line for line in envfile.read_text().splitlines()
         if line.split('=', 1)[0].strip().removeprefix('export ') not in controls]
lines.extend(key + '=' + value for key, value in controls.items())
temporary = envfile.with_name('.env.pluto-tmp')
temporary.write_text('\n'.join(lines) + '\n')
temporary.chmod(0o600)
temporary.replace(envfile)
yaml_path = home / '.hermes/config.yaml'
yaml_text = yaml_path.read_text()
yaml_text = re.sub(r'^(GATEWAY_ALLOW_ALL_USERS|TELEGRAM_ALLOW_ALL_USERS|DOCKER_HOST):[^\n]*\n?', '', yaml_text, flags=re.MULTILINE)
yaml_path.write_text(yaml_text)
print('Existing Telegram token and single-owner allowlist preserved; dev workspace configured.')
