---
module: cli
change: box-updater-pidfile-mode-counts-the-bridge-ready-only-on-its-discord-login-line-discord-logged-in-as-not-the-pre-login
---

# Delta — cli (box updater ready gate waits for the Discord login line)

## Modified

### REQUIREMENT REQ-cli-347

The box updater `scripts/corvidinho-update.sh` SHALL restart exactly one bridge through the
configured restart path. When `CORVIDINHO_BRIDGE_UNIT` is set and `CORVIDINHO_USE_PIDFILE` is
not, the unit SHALL win over a leftover pidfile: the updater SHALL restart the unit and SHALL NOT
`nohup`-start a bridge; a pidfile whose pid is gone SHALL be removed and a live pid named by it
SHALL NOT be signalled. Without a unit, an existing pidfile SHALL still select pidfile mode. The
updater SHALL source `CORVIDINHO_ENV_FILE` once, after `bun install` and before `doctor`, so
`doctor`, every restart path (pidfile, unit, command) and every rollback restart see the same
env. `CORVIDINHO_BRIDGE_CMD` SHALL run in `bash -lc` with its text passed through the
environment rather than the shell's argv, so a `pkill -f` pattern in it cannot match that shell,
and the documented `pkill -f` examples SHALL match the bridge process but not a shell whose
command line holds the example. In pidfile mode the updater SHALL count the restarted bridge
ready only when its log holds the line the gateway prints on Discord ClientReady
(`[discord] logged in as <tag>`), never on the pre-login `[discord] protocol version N OK`
line; if the bridge exits or that line does not appear within `CORVIDINHO_READY_TIMEOUT`, the
update SHALL roll back and exit 1 with log lines only. Unit mode SHALL keep its
`systemctl is-active` check.

Acceptance Criteria
- Unit set + leftover stale pidfile: `systemctl restart <unit>` runs, no `discord bridge` is started, the pidfile is removed.
- Unit set + pidfile naming a live pid: the unit is restarted and that pid is not signalled.
- No unit and no command + leftover pidfile: pidfile mode still starts the bridge.
- `doctor` and the unit restart see variables from `CORVIDINHO_ENV_FILE`; `bun install` does not.
- A rollback restart after a failed `bun install` or a failed `doctor` sees `CORVIDINHO_ENV_FILE`.
- A `CORVIDINHO_BRIDGE_CMD` containing `pkill -f '<pattern>'` completes (exit 0, no rollback) instead of killing its own shell.
- Each `pkill -f` pattern in `docs/BOX-UPDATE.md` matches `bun src/cli.ts discord bridge` and an absolute-path bridge command line, and does not match `bash -lc` holding the example.
- `log_indicates_ready` rejects a log holding only `[discord] protocol version N OK` (with or without a following login error) and accepts one holding `[discord] logged in as <tag>`, the line `src/discord/gateway.ts` prints inside its `Events.ClientReady` handler.
- Pidfile mode, a bridge that prints the protocol line and then exits 1: the update rolls back to the previous SHA and exits 1; it never logs "ready signal observed" or "OK updated".
- Pidfile mode, a bridge that prints the protocol line and never logs in: after `CORVIDINHO_READY_TIMEOUT` the updater logs a ready timeout naming the login line, rolls back and exits 1.
- Pidfile mode, a bridge that prints the login line: the update exits 0 with no rollback.
- Unit mode still runs `systemctl is-active --quiet <unit>`; an inactive unit rolls back and exits 1.
