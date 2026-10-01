#!/usr/bin/env python3
"""Run interactively as hermes; never print credentials or overwrite existing state."""
import getpass
import json
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = root / '.env.dev-server'
if target.exists():
    raise SystemExit('Existing .env.dev-server preserved. Edit it explicitly; do not regenerate encryption keys.')

values = {
    'SHOP_DOMAIN': 'dev.phutoshop.com', 'AUTH_DOMAIN': 'auth-dev.phutoshop.com',
    'IMAGE_NAMESPACE': 'pluto-dev', 'IMAGE_TAG': 'unbuilt',
    'POSTGRES_DB': 'plutoshop_dev', 'POSTGRES_USER': 'pluto',
    'KEYCLOAK_DB_NAME': 'keycloak_dev', 'KEYCLOAK_DB_USER': 'keycloak',
    'KEYCLOAK_ADMIN': 'dev-admin',
    'KEYCLOAK_REALM_FILE': './infra/dev/runtime/realm-dev.json',
    'OIDC_CLIENT_ID': 'pluto-web',
    'SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_AUDIENCE': 'pluto-api',
    'FULFILLMENT_SECURITY_KEY_VERSION': '1', 'FULFILLMENT_DELIVERY_ENABLED': 'true',
    'INWCLOUD_API_BASE_URL': 'https://api.inwcloud.shop',
    'INWCLOUD_TRUEWALLET_ENABLED': 'false', 'INWCLOUD_TRUEWALLET_AMOUNT_UNIT': '',
    'SMTP_PORT': '587', 'SMTP_FROM_DISPLAY_NAME': 'Phuto Shop Dev',
}
for key in ('POSTGRES_PASSWORD', 'POSTGRES_HERMES_PASSWORD', 'POSTGRES_APP_PASSWORD', 'POSTGRES_WRITE_PASSWORD',
            'POSTGRES_ADMIN_PASSWORD', 'POSTGRES_INSPECTOR_PASSWORD', 'KEYCLOAK_DB_PASSWORD',
            'KEYCLOAK_ADMIN_PASSWORD', 'AUTH_SESSION_SECRET'):
    values[key] = secrets.token_hex(32)
for key in ('FULFILLMENT_SECURITY_ENCRYPTION_KEY_BASE64',
            'FULFILLMENT_SECURITY_FINGERPRINT_KEY_BASE64',
            'INWCLOUD_TRUEWALLET_FINGERPRINT_KEY_BASE64'):
    values[key] = secrets.token_urlsafe(32)
import_file = Path('/srv/hermes/dev-control/provider-import.json')
imported = json.loads(import_file.read_text()) if import_file.exists() else {}
for key in ('SMTP_HOST', 'SMTP_FROM', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'INWCLOUD_API_KEY'):
    value = imported.get(key)
    if value is None:
        value = getpass.getpass(key + ' (hidden): ') if key.endswith(('PASSWORD', 'KEY')) else input(key + ': ')
    if not value or value.startswith('replace-with-') or any(c in value for c in "'\\\r\n"):
        raise SystemExit('Required value must not contain quotes, backslashes or line breaks: ' + key)
    values[key] = value
if imported.get('SMTP_PORT'):
    values['SMTP_PORT'] = imported['SMTP_PORT']
os.umask(0o077)
with target.open('x') as handle:
    handle.write(''.join(f"{key}='{value}'\n" for key, value in values.items()))
if import_file.exists():
    import_file.unlink()
print('Created protected .env.dev-server. TrueWallet remains disabled pending separate acceptance.')
