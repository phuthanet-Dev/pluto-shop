# Hermes Dev capabilities design

## Goal

Give the owner-requested Hermes Telegram agent enough access to develop PlutoShop
and operate the Dev database, while keeping Production and backup credentials
outside the agent's reach. Dev is public and accepts real payments, so its data
must remain persistent and payment outcomes must continue to reflect provider
verification.

## Current state

- The Linux account `hermes` owns `/srv/hermes/pluto-shop` and runs the existing
  allowlisted Telegram gateway.
- The setup config selects Hermes' local terminal backend, sets the workspace to
  `/srv/hermes/pluto-shop`, and sets `DOCKER_HOST` to the rootless Docker socket
  under `/run/user/<hermes-uid>/docker.sock`.
- A systemd user-service drop-in limits Hermes to its home and rootless runtime
  paths and hides the production checkout, production Docker socket, and
  administrator backup credentials.
- The repository has a read-only `pluto_inspector` database role, with selected
  sensitive columns excluded. No dedicated broad Dev data-writer is configured
  for Hermes.
- The deployed Dev Compose file and `.env.dev-server` are server-side runtime
  configuration and are not present in this checkout. Implementation must
  inspect those files locally on the server without copying secrets into Git,
  logs, or chat.
- The observed failures are that Hermes has been unable to do useful repository
  work and the Telegram session received `PermissionError` accessing the
  rootless Docker socket. The intended settings alone do not establish which
  runtime boundary is failing.

## Approved scope

Hermes must be able to:

1. Read and edit the repository in `/srv/hermes/pluto-shop`, run its development
   tools and tests, create commits on `hermes/*` task branches, build Dev images,
   and deploy through `infra/dev/deploy.sh` after its checks pass.
2. Read, insert, update, and delete rows in every application table in the Dev
   shop database `plutoshop_dev`, including order, payment, cart, and fulfillment
   records and fulfillment inventory, when working on an owner-requested task.
   This includes access to customer/order details and sensitive Dev fulfillment
   and payment metadata; it must not be copied to Git, logs, or Telegram.
3. Change the Dev application schema, including adding and removing columns and
   tables, by creating versioned Flyway migrations and applying them through the
   existing Dev deployment workflow.

The access grant does not include Production, `/var/run/docker.sock`, sudo,
administrator backup credentials, or the separate Keycloak database. It does
not authorize changing provider-side payment state, fabricating payment
success, rotating fulfillment/payment encryption keys, resetting persistent
volumes, bulk-deleting Dev data, or erasing real order/payment history without
an explicit owner request and a verified backup.

## Proposed architecture

### Agent execution and repository access

Keep the existing gateway account and local terminal backend. Repair and verify
the actual Telegram-session execution path instead of assuming that the saved
configuration is active. The session must start in `/srv/hermes/pluto-shop`, see
the expected Git branch and clean/dirty state, and be able to create and remove a
temporary file in its own workspace. Confirm the terminal, file-editing, and
code-execution tools used by the installed Hermes version are available to the
allowlisted owner session.

Keep Dev development and deployment on the rootless Docker daemon only. Diagnose the socket
from the running gateway context: effective UID, `DOCKER_HOST`, socket path and
mode, rootless Docker health, and access to the Dev Compose project. Do not fix a
Dev permission error by adding Hermes to sudo or the production `docker` group,
or by falling back to `/var/run/docker.sock`.

### Dev data access

Add a dedicated login role for Hermes in `plutoshop_dev`. Grant table-level
`SELECT`, `INSERT`, `UPDATE`, and `DELETE` on all current application tables and
appropriate sequence use, plus default privileges for future application
tables and sequences. Grant `CONNECT` to `plutoshop_dev` and `USAGE` on the
application schema. The role must not be a superuser, database owner, role
administrator, or schema owner. It must not have `CREATE`, `ALTER`, `DROP`, or
privileges on the Keycloak database. Keep the existing restricted inspector
role available for read-only tools and diagnostics.

Keep PostgreSQL private on the Dev Compose network; do not publish its port to
the public interface or add a host-network database path. Access the dedicated
role through a Dev-only client path that uses the rootless Dev runtime and
private runtime configuration without printing credentials. Never use
Production connection settings as a fallback.

The dedicated SQL role is the least-privilege normal database connection, not a
hard boundary against code that controls the rootless Dev Docker daemon. The
migration workflow is a process control. The actual security boundary remains
the Hermes Unix account and systemd isolation from Production and administrator
backup credentials; implementation must verify those restrictions in the
running gateway context. A higher-privilege database account may be used by
the guarded migration service only, never as a fallback for ordinary data edits.

### Dev schema changes

Hermes may author migrations for both additive and destructive Dev schema
changes. It must apply schema changes only through the checked-in Flyway
migration workflow and `infra/dev/deploy.sh`, not by issuing ad hoc DDL against
the running database. Migrations must be tested against disposable test
databases, preserve compatibility with the currently running application, and
pass the existing pre-migration encrypted backup and restore-verification gate.

Column/table removal or data conversion that cannot be reversed must use an
expand-and-contract sequence where practical. Hermes must show the migration
and impact to the owner for review before applying an irreversible change,
consistent with `infra/dev/HERMES.md`. A migration failure stops the update;
there is no automatic database rollback. The previous application release and
all Dev data remain available for repair.

### Task and data workflow

For an owner-requested task, Hermes uses a `hermes/*` branch, inspects the
relevant code and Dev rows, makes the requested change, and runs related lint,
type, and tests. It commits only the intended source and migration files. Before
deployment, it uses the existing workflow to build SHA-tagged images, request
and verify an encrypted off-host backup, apply migrations, start Dev services,
and check health and the storefront. It then reports the commit, checks, and
Dev URL in the existing Telegram conversation.

Database row access is broad within the Dev shop database, but actions remain
task-scoped: preserve unrelated rows and real orders, do not bulk-reset data,
and do not mark payments successful without provider verification. Targeted
deletion or rewriting of payment/order history requires an explicit owner task
and a verified backup. If a requested data change conflicts with provider truth
or fulfillment history, Hermes must report the conflict rather than silently
rewriting it.

## Failure handling

- If the workspace, terminal tools, or rootless Docker socket still fail
  verification, keep the current Dev release running and report the failed
  check. Do not substitute production access.
- If the database role or connection test fails, do not expose PostgreSQL to the
  public network and do not use a more privileged account as a workaround.
- Keep Dev database, SMTP, and payment credentials out of commits, Telegram
  messages, and build/deploy logs. Do not print runtime environment files.
- A failed test, build, configuration validation, backup, or restore check
  blocks deployment and migration.
- A failed migration stops the deployment for investigation. Do not restore the
  Dev database automatically or discard orders created after the backup.
- Production stays parked and manually controlled throughout this work.

## Acceptance criteria

1. An unauthorized Telegram account remains unable to use the gateway, while
   the existing owner account can invoke Hermes' terminal, file, and code tools.
2. From the Telegram session, Hermes can inspect and edit the repository on a
   `hermes/*` branch, run a small relevant test, and commit a source-only change.
3. From that same execution context, rootless Docker reports its rootless mode;
   Hermes can build/test and use the Dev Compose project, while Production's
   Docker daemon and files remain inaccessible.
4. The dedicated database login can read and perform DML on every application
   table in `plutoshop_dev`, including future tables, and cannot perform DDL,
   manage roles, connect to the Keycloak database, or access Production.
5. Hermes can author additive and destructive schema migrations, validate them
   on disposable databases, and apply an owner-requested migration to Dev only
   after the existing backup gate succeeds. No live schema probe is made just
   to test permissions. An irreversible migration is reviewed by the owner
   before application.
6. Production files, the production Docker socket, and off-host backup
   credentials remain inaccessible from the Hermes service context. Dev's
   database is not exposed to the internet.
7. Existing policies remain in force: no success-state fabrication, no
   encryption-key rotation, no volume reset, no automatic database rollback,
   and no production deployment.

## Out of scope

- Changing Telegram credentials, the existing owner allowlist, model provider,
  or APILL configuration.
- Granting Hermes sudo, production Docker access, Production database access,
  Keycloak database access, or backup credentials.
- Publishing PostgreSQL or creating a new public database endpoint.
- Automatically reopening Production or migrating Dev orders to Production.
