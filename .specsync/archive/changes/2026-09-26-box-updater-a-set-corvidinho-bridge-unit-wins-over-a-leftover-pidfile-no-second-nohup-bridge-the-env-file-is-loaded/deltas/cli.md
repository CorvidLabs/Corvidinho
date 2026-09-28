---
module: cli
change: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
---

# Delta — cli (box updater restart mode + env)

## Added

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
command line holds the example.

Acceptance Criteria
- Unit set + leftover stale pidfile: `systemctl restart <unit>` runs, no `discord bridge` is started, the pidfile is removed.
- Unit set + pidfile naming a live pid: the unit is restarted and that pid is not signalled.
- No unit and no command + leftover pidfile: pidfile mode still starts the bridge.
- `doctor` and the unit restart see variables from `CORVIDINHO_ENV_FILE`; `bun install` does not.
- A rollback restart after a failed `bun install` or a failed `doctor` sees `CORVIDINHO_ENV_FILE`.
- A `CORVIDINHO_BRIDGE_CMD` containing `pkill -f '<pattern>'` completes (exit 0, no rollback) instead of killing its own shell.
- Each `pkill -f` pattern in `docs/BOX-UPDATE.md` matches `bun src/cli.ts discord bridge` and an absolute-path bridge command line, and does not match `bash -lc` holding the example.
