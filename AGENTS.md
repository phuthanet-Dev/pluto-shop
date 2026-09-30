# Repository work

Preserve unrelated work and never commit local credentials or generated runtime state.
Keep production deployment manual. Do not deploy production or change its data as
part of a development preview.

## Hermes on the Linux dev server

When running as the Unix user `hermes` in `/srv/hermes/pluto-shop`, read and follow
`infra/dev/HERMES.md`. That file defines the owner's Telegram task workflow,
allowed branches, persistent real-payment data and the rootless deployment command.
It does not grant permission to perform production operations or send unsolicited
messages. The initial setup branch `codex/linux-dev-environment` is allowed for
bootstrap; subsequent task branches use `hermes/*`.
