# Hermes Runtime Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the allowlisted Hermes Telegram session able to edit and test the project and use the rootless Dev Docker daemon, without access to Production or backup credentials.

**Architecture:** Keep the existing local terminal backend and diagnose the live gateway context with a redacted runtime probe. Correct only the config or systemd control identified by that probe; keep the Dev socket available and the Production paths blocked.

**Tech Stack:** Python 3.11 standard library, Bash, systemd user services, rootless Docker, Node.js test suite.

**Spec:** `docs/superpowers/specs/2026-10-01-hermes-dev-capabilities-design.md`

## Global Constraints

- Workspace: `/srv/hermes/pluto-shop`.
- Use only `/run/user/<hermes-uid>/docker.sock` for Dev Docker operations.
- Keep the existing single-owner Telegram allowlist and all allow-all settings disabled.
- Use a `hermes/*` task branch; `codex/linux-dev-environment` is reserved for bootstrap work.
- Hermes must not receive sudo or Production `docker` group membership.
- Keep `/var/run/docker.sock`, `/opt/pluto-shop`, and `/etc/pluto-dev-backup.env` inaccessible to the Hermes service.
- Never print Telegram, payment, SMTP, database, or backup credentials.
- Production remains parked and manually controlled.

## Review Focus

- A saved `terminal.cwd` value may not be active in the running gateway; test the reported workspace with `testReportsWrongWorkspace` and verify the actual Telegram session during live acceptance.
- `DOCKER_HOST` may be missing or wrong in the subprocess environment; test with `testReportsMissingOrWrongDockerHost`.
- A present socket may still be denied by its owner, mode, or service namespace; verify with `test_passes_expected_workspace_and_rootless_socket`, `test_reports_docker_permission_failure`, and the live probe.
- Fixing Dev access could accidentally expose Production paths or sockets; verify with `testSystemdDropInPreservesProductionIsolation` and inspect the service manager's deny-path settings without opening or connecting to any Production or backup path.
- Hermes may have terminal access but lack write permission in the repository; verify with `testWorkspaceWriteProbe` and a Telegram file-edit smoke test.

---

### Task 1: Add a redacted runtime probe

**Files:**
- Create: `infra/dev/hermes_runtime_check.py`
- Create: `infra/dev/test_hermes_runtime_check.py`
- Modify: `scripts/dev-server.test.mjs`
- Modify: `docs/dev-server-runbook.md`

**Interfaces:**
- Produces `collect_checks(*, uid: int, cwd: Path, env: Mapping[str, str], run: Callable) -> dict[str, bool]` and `render_report(checks: Mapping[str, bool]) -> str`.
- The CLI runs as Hermes and reports fixed check names and pass/fail only; it never prints environment values, file contents, or subprocess stderr.

- [ ] **Step 1: Write failing unit tests**

  Add `test_passes_expected_workspace_and_rootless_socket`, `test_reports_wrong_workspace`, `test_reports_missing_or_wrong_docker_host`, `test_reports_docker_permission_failure`, `test_workspace_write_probe`, and `test_report_never_contains_environment_values`. Extend `scripts/dev-server.test.mjs` with `testSystemdDropInPreservesProductionIsolation` and `testKeepsTelegramOwnerAllowlistEnabled`. Mock process calls and filesystem checks; include a sentinel secret in the test environment and assert it never appears in output.

- [ ] **Step 2: Run the tests and confirm the expected failures**

  Run: `python3 -m unittest discover -s infra/dev -p 'test_hermes_runtime_check.py' -v`

  Expected: FAIL because the probe module and report interface do not exist yet.

- [ ] **Step 3: Implement the probe**

  Check the effective UID, exact workspace, Git root, temporary file create/remove, expected rootless `DOCKER_HOST`, rootless socket connection/security option, and `docker compose ... config --quiet`. Read the Hermes service manager's `InaccessiblePaths` property with `systemctl --user show hermes-gateway --property=InaccessiblePaths --value` and verify that `/opt/pluto-shop`, `/var/run/docker.sock`, and `/etc/pluto-dev-backup.env` remain denied; do not open, stat, or connect to those paths. Capture subprocess output and emit only named pass/fail results.

- [ ] **Step 4: Run focused checks**

  Run the Python unit tests and `npm run test:dev-server` in the development checkout. Run `python3 infra/dev/hermes_runtime_check.py` only from the owner-allowlisted Telegram session on the Linux server.

  Expected: unit tests PASS; the live command reports each check without secret values; Compose tests PASS.

- [ ] **Step 5: Commit the probe and runbook update**

  ```bash
  git add infra/dev/hermes_runtime_check.py infra/dev/test_hermes_runtime_check.py scripts/dev-server.test.mjs docs/dev-server-runbook.md
  git commit -m "feat: diagnose Hermes dev runtime access"
  ```

### Task 2: Repair only the runtime control identified by the probe

**Files:**
- Modify if the runtime evidence requires it: `infra/dev/configure-hermes.py`
- Modify if the service unit is the cause: `infra/dev/admin-start-dev.sh` and `infra/dev/admin-fix-gateway.sh`
- Modify: `scripts/dev-server.test.mjs`
- Modify: `docs/dev-server-runbook.md`

**Interfaces:**
- Consumes the fixed pass/fail report from Task 1.
- Produces a verified gateway context where repository editing and rootless Dev Docker work while the Production/backup negative checks remain blocked.

- [ ] **Step 1: Run the probe in the active Telegram session and record only its pass/fail output**

  Run from the owner-allowlisted Hermes conversation on the Linux server: `python3 infra/dev/hermes_runtime_check.py`.

  Expected: the workspace and file-write checks pass; any failing Docker or isolation check is named without exposing secrets.

- [ ] **Step 2: Add regression assertions for the identified mismatch**

  For a config mismatch, test the generated backend, workspace, and `DOCKER_HOST`. For a systemd namespace mismatch, test that the drop-in grants only the Hermes workspace/runtime and retains the three Production/backup deny paths. Also assert the owner allowlist remains present and every allow-all setting remains disabled. Do not add broad permission modes or group membership.

- [ ] **Step 3: Correct the narrow setting**

  Use the installed Hermes CLI's supported configuration for backend/workspace changes. If the rootless daemon or its socket is the cause, repair its Hermes-owned user service or expose only `/run/user/<hermes-uid>/docker.sock` to the gateway service. Preserve `InaccessiblePaths` for Production and backup paths. Add `systemctl --user daemon-reload` before restart when the drop-in changes.

- [ ] **Step 4: Run syntax, repository, and regression tests**

  Run: `bash -n infra/dev/admin-start-dev.sh infra/dev/admin-fix-gateway.sh`, `python3 -m unittest discover -s infra/dev -p 'test_hermes_runtime_check.py' -v`, and `npm run test:dev-server`.

  Expected: all checks PASS; no secret is printed.

- [ ] **Step 5: Restart only the identified Hermes gateway and verify from Telegram**

  The owner applies the reviewed admin update using the existing setup procedure. From the allowlisted Telegram session, rerun the probe, edit a temporary file using Hermes' file tool, run a small repository test, and confirm the Production/backup checks still fail closed.

  Expected: repository write, terminal, file tool, rootless Dev Docker, and Dev Compose checks PASS; service-manager policy confirms Production and backup paths remain denied without probing those paths.

- [ ] **Step 6: Commit the targeted runtime repair**

  ```bash
  git add infra/dev/configure-hermes.py infra/dev/admin-start-dev.sh infra/dev/admin-fix-gateway.sh scripts/dev-server.test.mjs docs/dev-server-runbook.md
  git commit -m "fix: enable Hermes rootless dev runtime"
  ```
