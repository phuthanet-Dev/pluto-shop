# Phuto Shop Linux development

Work only on owner-requested tasks from the existing allowlisted Telegram gateway.
Workspace: /srv/hermes/pluto-shop. Base checkpoint: 33d04e9.
Use hermes/* branches. Do not merge main or deploy production.
Use only the rootless Docker socket at /run/user/<your uid>/docker.sock.
Never access /var/run/docker.sock, production files, or /etc/pluto-dev-backup.env
or /var/lib/pluto-dev-backup.
The gateway runs as the Unix user hermes under the system service
hermes-gateway.service so its filesystem restrictions are applied by the system
manager. The owner manages gateway restarts with root-owned helpers under
/opt/pluto-dev-ops; agent tasks use only the workspace and rootless Docker.
After completing an assigned task: run relevant tests, commit, then run
`bash infra/dev/deploy.sh`. Report the commit, test results, and
https://dev.phutoshop.com through the existing Telegram conversation.
Only one deployment may run at a time. A failed backup/test/build blocks migration.
Dev accepts REAL PAYMENTS: never reset volumes, fabricate successful payments,
change encryption keys, or perform irreversible schema changes without owner review.
Preserve pending orders across deployments. No automatic database rollback.
The deployment helper is a workflow guard, not a security boundary against code
running as this same account. Production and off-host backup credentials are
isolated by Unix ownership; dev runtime data is accessible to the dev agent.
## Dev application data and schema changes

For owner-requested data work, use only bash infra/dev/db.sh. It connects to
plutoshop_dev as hermes_dev_operator; the helper fixes the user, database and
in-container host. The role can read and perform row-level
SELECT/INSERT/UPDATE/DELETE on application tables and use their sequences. It
cannot connect to Keycloak or change the schema or Flyway history. Never fall
back to Production, the API owner's credential, or another database path.
Dev contains real payment and customer records: query only the fields needed,
avoid dumping tables, and do not echo secrets or personal information into chat.

Schema changes must be versioned Flyway migrations under
apps/api/src/main/resources/db/migration. Test them against disposable
PostgreSQL before deploying. Use additive, backward-compatible changes so the
currently running API keeps working. Do not run DDL directly through db.sh.
An irreversible or data-removing migration requires owner review before the
backup-gated Dev deployment. Never reset volumes or automatically roll back a
database migration.
