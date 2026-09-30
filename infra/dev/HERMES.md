# Phuto Shop Linux development

Work only on owner-requested tasks from the existing allowlisted Telegram gateway.
Workspace: /srv/hermes/pluto-shop. Base checkpoint: 33d04e9.
Use hermes/* branches. Do not merge main or deploy production.
Use only the rootless Docker socket at /run/user/<your uid>/docker.sock.
Never access /var/run/docker.sock, production files, or backup credentials.
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
