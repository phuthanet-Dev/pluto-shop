import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const suffix = randomBytes(6).toString('hex');
const pg = 'pluto-review-pg-' + suffix;
const kc = 'pluto-review-kc-' + suffix;
const password = randomBytes(24).toString('hex');
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || 'Docker failed');
  return r.stdout.trim();
}
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));
async function ready(args) {
  for (let n = 0; n < 90; n++) {
    try { return docker(args); } catch { await delay(); }
  }
  throw new Error('Container readiness timed out');
}
const sql = (query, db = 'postgres') => docker(['exec', '-i', pg, 'psql', '-X', '-U', 'postgres', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1'], query);
try {
  docker(['run', '-d', '--name', pg, '--network', 'none', '--tmpfs', '/var/lib/postgresql', '-e', 'POSTGRES_PASSWORD=' + password, 'postgres:18.6']);
  await ready(['exec', pg, 'pg_isready', '-U', 'postgres']);
  const helper = readFileSync('infra/production/dump-media-manifest.sh', 'utf8').replaceAll('\r\n', '\n');
  const manifestSql = helper.split("<<'SQL'\n")[1].split('\nSQL')[0];
  assert.equal(sql(manifestSql), '');
  sql("CREATE TABLE products(image_key text); INSERT INTO products VALUES ('11111111-1111-1111-1111-111111111111');");
  docker(['exec', pg, 'pg_dump', '-U', 'postgres', '-Fc', '--no-owner', '--no-acl', '-f', '/tmp/test.dump', 'postgres']);
  sql("UPDATE products SET image_key = '22222222-2222-2222-2222-222222222222'; CREATE DATABASE restored;");
  docker(['exec', pg, 'pg_restore', '-U', 'postgres', '--exit-on-error', '--no-owner', '--no-acl', '-d', 'restored', '/tmp/test.dump']);
  assert.equal(sql(manifestSql, 'restored'), '11111111-1111-1111-1111-111111111111');
  assert.equal(sql(manifestSql), '22222222-2222-2222-2222-222222222222');
  console.log('PASS: empty database and dump references remain correct after live media changes');
  sql('CREATE DATABASE keycloak;');
  docker(['run', '-d', '--name', kc, '--network', 'container:' + pg,
    '--read-only', '--tmpfs', '/opt/keycloak/data', '--tmpfs', '/tmp',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '-e', 'KC_DB=postgres', '-e', 'KC_DB_URL=jdbc:postgresql://127.0.0.1:5432/keycloak',
    '-e', 'KC_DB_USERNAME=postgres', '-e', 'KC_DB_PASSWORD=' + password,
    '-e', 'KC_HOSTNAME=https://auth.example.com', '-e', 'KC_HTTP_ENABLED=true',
    '-e', 'KC_PROXY_HEADERS=xforwarded', 'pluto-keycloak:review-fix', 'start', '--optimized']);
  await ready(['exec', kc, 'bash', '-ec', 'exec 3<>/dev/tcp/127.0.0.1/9000; printf "GET /health/ready HTTP/1.0\r\n\r\n" >&3; grep -q "200 OK" <&3']);
  console.log('PASS: optimized Keycloak returns HTTP 200 on health/ready');
} finally {
  for (const name of [kc, pg]) spawnSync('docker', ['rm', '-f', '-v', name], { encoding: 'utf8' });
}
