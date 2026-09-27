---
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
artifact: context
---

# Context

A long-running end-to-end check of `origin/main` (defect D5) found that the box updater
`scripts/corvidinho-update.sh` declared a pidfile-mode bridge ready before it had logged in to
Discord. `log_indicates_ready` (`scripts/lib/update-helpers.sh`) accepted either
`[discord] logged in` or `protocol version N OK`. The bridge prints the protocol line from the
pre-login handshake (`src/discord/protocol-version.ts`, called at `src/discord/bridge.ts` ~411),
long before `client.login` (`src/discord/gateway.ts` ~446). With a bad token the real bridge logs
`[discord] protocol version 2 OK`, then an unhandled `DiscordAPIError` 403 and exits 1; the
updater still logged "ready signal observed" and "OK updated …", exited 0 and never rolled back.

Re-verified on `0e6e8d2` (current main): the helper still accepts the protocol line, and a fake
bridge that prints it then exits 1 makes the update exit 0.

The bridge already prints a distinct line only after a successful login:
`[discord] logged in as <tag>`, from the `Events.ClientReady` handler in `src/discord/gateway.ts`.
No bridge change is needed; the updater now requires that line.

Constraints: systemd mode keeps `systemctl is-active` (it never read the log). The timeout
(`CORVIDINHO_READY_TIMEOUT`, default 60) and rollback behaviour are unchanged; only the log lines
now name the line being waited for. Out of scope (separate defects in the same report): pidfile
pid identity check (D6), avoidable restart on doctor failure (D7), rollback `bun install` with the
env file loaded (D8).
