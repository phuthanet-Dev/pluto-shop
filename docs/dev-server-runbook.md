# Linux dev and production parking

Baseline: `33d04e9`. The setup branch is `codex/linux-dev-environment`.
Production remains in `/opt/pluto-shop/current`. Never replace that checkout with dev.
Dev runs as `hermes` in `/srv/hermes/pluto-shop`, using a separate rootless Docker daemon.
Dev is public and accepts real payments; its data is persistent, not disposable.

## Owner setup (sudo required)

The setup checkout must be the reviewed, committed setup branch. Do not execute
root scripts from a branch subsequently modified by Hermes. The installer copies
privileged operations to root-owned `/opt/pluto-dev-ops`; changing those copies
requires another administrator review. No sudo permission is granted to Hermes.

```bash
cd /home/dev/pluto-dev-setup
sudo bash infra/dev/admin-install.sh
sudo python3 infra/dev/import-provider-settings.py
sudo -u hermes -H python3 /srv/hermes/pluto-shop/infra/dev/configure.py
```

The importer copies ONLY the owner's authorized SMTP/payment settings into a
private one-use file. Database passwords, session secrets and encryption keys
are generated independently. TrueWallet starts disabled until its own acceptance;
set `INWCLOUD_TRUEWALLET_ENABLED=true` and the verified `BAHT`/`SATANG` unit only
after confirming provider configuration. Never rotate encryption/fingerprint
keys after orders have been created. Never print the environment file in chat.

DNS A records: `dev.phutoshop.com` and `auth-dev.phutoshop.com` → `217.216.39.229`.
Remove conflicting AAAA records unless IPv6 is also routed to this server.

### Existing Hermes gateway

Run `sudo bash infra/dev/admin-inspect.sh` and inspect the reported service and
configuration paths locally. Do not paste complete unit/environment/config files.
Confirm the installed gateway version with its actual binary before editing it.
Use its existing Telegram token and the owner's numeric Telegram ID in
`TELEGRAM_ALLOWED_USERS`; disable any allow-all setting and remove unwanted
paired users. Verify with an unauthorized Telegram account before deployment.
Set the terminal workspace to `/srv/hermes/pluto-shop`, the local terminal backend,
and `DOCKER_HOST=unix:///run/user/$(id -u hermes)/docker.sock` in the gateway's
environment. The repository `AGENTS.md` points to `infra/dev/HERMES.md`; confirm
the installed version loads these project instructions. Restart only the identified gateway service, preserving its other
model/provider settings. Do not guess its service name or launch a second bot.

Hermes must have neither `sudo` nor `docker` group membership. Verify that it
cannot read `/opt/pluto-shop/current/.env.production` or `/etc/pluto-dev-backup.env`
and cannot use `/var/run/docker.sock`. Give any Git credential only the required
repository access; never a production SSH key or an unrestricted account token.

#### Diagnose the running Telegram session

After the gateway is configured, ask Hermes from the owner-allowlisted Telegram
conversation to run `python3 infra/dev/hermes_runtime_check.py` in
`/srv/hermes/pluto-shop`. The command reports only fixed check names and `PASS` or
`FAIL`; it captures Docker/systemd output and never prints environment values or
file contents. Share only that redacted report when diagnosing a failure. The
isolation check reads the service manager's `InaccessiblePaths` property; it does
not open or connect to Production or backup paths. Do not repair a failed Dev
socket check by granting sudo, Production Docker access, or broader filesystem
permissions.

## Initial dev deployment

For the existing default-profile `hermes-gateway.service`, after the owner confirms
the single numeric allowlisted Telegram ID, the following helper keeps the gateway
binary/model/token, configures the dev workspace, and starts an unprivileged build
with a readable operator log:

```bash
sudo bash /home/dev/pluto-dev-setup/infra/dev/admin-start-dev.sh
tail -n 50 /var/log/pluto-dev-build.log
```

It refuses an unrecognized gateway entrypoint or a multi-user/empty allowlist.
Verify an unauthorized Telegram user is rejected; configuration alone does not
replace this acceptance test. Do not start a second build while the service runs.
If using the manual path instead:

```bash
sudo -u hermes -H bash /srv/hermes/pluto-shop/infra/dev/deploy.sh
sudo bash /opt/pluto-dev-ops/verify-backup.sh dev
sudo systemctl enable --now pluto-dev-backup.timer
```

Deployment uses a nonblocking lock, a clean allowed branch and SHA-tagged images.
It runs web checks and Maven verification before changing containers. A root-owned
service handles off-host backup and full restore verification; the agent gets
only a receipt matching its request. Backup credentials are never passed into
agent containers. A missing/failed backup blocks migration and keeps the old
app running. Migrations must be backward-compatible because the old application
may still be running while they apply. No automatic database rollback is performed.
An application startup failure is reported and requires fixing/redeploying; images
and data are retained. This workflow is not a security boundary against the same
Unix account deliberately bypassing it.

The rootless Docker service is limited to 3 CPU / 6 GiB; the complete hermes user
slice to 4 CPU / 8 GiB. Watch memory pressure during first build; do not build jobs
concurrently. Review limits after observing real workload. The public endpoints
are enabled by the production parking step, not by this initial local build.

## Hermes Dev database access

The Dev deploy creates a one-time POSTGRES_HERMES_PASSWORD only when missing,
keeps .env.dev-server mode 0600, and never rotates existing credentials.
After Flyway succeeds and the matching encrypted backup receipt is present, the
one-shot hermes-db-role-bootstrap service grants the Hermes operator role
access to application tables and sequences in plutoshop_dev. PostgreSQL stays
private on the internal data network. The role cannot connect to the
Keycloak database, mutate Flyway history, or create schema objects.

From the owner-allowlisted Telegram session, verify the fixed helper with a
metadata-only query:

~~~bash
printf 'SELECT current_user, current_database();\n' | bash infra/dev/db.sh
~~~

It must report hermes_dev_operator and plutoshop_dev. Send only the result
needed for the owner's task; avoid table dumps and redact customer/payment data.
The helper rejects options that change the host, database, or role. Do not use
Production credentials or alternate connection paths.

All schema changes remain versioned Flyway migrations. Prefer expand-and-contract
for changes that alter existing data: add a nullable replacement column or new
table first, backfill data while the old shape remains available, and preserve
compatibility with the currently running API. Remove the old column or table only
in a later migration after no deployed application version uses it. The
Testcontainers fixtures under apps/api/src/test/resources/db/migration stay
outside the runtime API image. Run the API migration tests against disposable
PostgreSQL, then use the normal Dev deployment. The existing off-host backup and
restore-verification gate runs before each migration; the Hermes role is
refreshed after migration and before API/web services start. Ask the owner to
review irreversible migrations before deployment.
## Freeze production (only after backup/restore succeeds)

```bash
sudo bash /home/dev/pluto-dev-setup/infra/dev/admin-publish-dev.sh
```

The publication helper requires the latest setup commit to have deployed locally,
refreshes the reviewed root-owned operations, and verifies a post-migration dev
backup. The pause script records rollback files and timer state, validates Caddy, stops
writers, captures both production databases/media/secrets/config/certificates,
uploads a `pluto-freeze` snapshot, restores both databases in an isolated test
container and checks media references. On failure it attempts to restart the
original services and timers. Do not retry blindly if a pause state directory
already exists; inspect services, the saved snapshot and logs first.

After success it stops production containers (never deletes volumes), uses the
existing certificate volumes with a host-network Caddy, returns 503/Retry-After
on both production domains, and proxies dev loopback ports 13000/18081. The edge
has its admin API disabled. Do not run both old and new Caddy at once.

Snapshot tags `pluto-freeze` and `pluto-dev` do not match old `pluto-shop` retention.
The new scripts intentionally do not prune snapshots. Review storage growth
monthly and define a retention policy only after the archived production snapshot
has independent protection. Preserve `/etc/pluto-dev-backup.env` in the owner's
password manager; loss of the Restic key makes recovery impossible.

## Acceptance before inviting real users

- Verify HTTP redirects to HTTPS, valid certificates, production 503 and Retry-After,
  dev `X-Robots-Tag: noindex`, and the real-payment notice on public/admin pages.
- Confirm signup/email verification/login/logout and least-privilege admin access
  with separate test users. Keycloak admin/master endpoints must not be public.
- From an external machine confirm 13000, 18081, 3000, 5432, 8080 and 8081 are closed.
- Test catalog, cart, image upload, fulfillment and unauthorized API requests.
- For PromptPay/TrueWallet separately, use owner-selected small-value transactions;
  verify amount, duplicate requests, expiry, failed redemption and recovery after
  API restart with a pending order. Do not fabricate provider success or consume
  real vouchers during automated tests.
- Do one valid update and one deliberately failing test on a temporary task branch;
  the failed update must preserve the previous web release and data.
- Check `systemctl status pluto-dev-backup.service` and run full restore verification
  after real data has been created. Daily backup failure must be investigated before
  further deployments. Connect an external monitor to the dev endpoints and backup
  job before inviting customers; no new messaging destination is assumed.

Payment flow remains the existing server-verified provider integration. Do not
add callback paths without checking the actual provider contract. Keep real dev
orders across updates and plan their settlement before a production relaunch.

## Reopen the preserved production release

```bash
sudo bash /opt/pluto-dev-ops/resume-production.sh
```

This starts the saved old images without migrations, returns the original Caddy
and timers, and makes the dev URL unavailable while preserving dev data. It does
not promote dev code or move dev orders. A new production release is a separate
reviewed migration/deployment after pending dev payments are settled.

References: [Docker rootless prerequisites](https://docs.docker.com/engine/security/rootless/)
and [Hermes gateway](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/).
