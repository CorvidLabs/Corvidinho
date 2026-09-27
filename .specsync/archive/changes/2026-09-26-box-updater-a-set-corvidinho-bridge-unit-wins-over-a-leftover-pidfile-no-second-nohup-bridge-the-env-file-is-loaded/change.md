---
id: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
state: archived
type: bug_fix
base_commit: 2ff0598784b5e7c72f2c0eedbb85131324e7e239
---

# Box updater: a set CORVIDINHO_BRIDGE_UNIT wins over a leftover pidfile (no second nohup bridge), the env file is loaded once before doctor and every restart/rollback path, and CORVIDINHO_BRIDGE_CMD runs with its text off the shell argv so pkill -f cannot kill its own shell

## Intent

Box updater: a set CORVIDINHO_BRIDGE_UNIT wins over a leftover pidfile (no second nohup bridge), the env file is loaded once before doctor and every restart/rollback path, and CORVIDINHO_BRIDGE_CMD runs with its text off the shell argv so pkill -f cannot kill its own shell

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- With CORVIDINHO_BRIDGE_UNIT set, a leftover pidfile no longer selects pidfile mode: the updater runs systemctl restart and starts no nohup bridge; a stale pidfile is removed and a live pid in it is never signalled. Without a unit, a leftover pidfile still selects pidfile mode. CORVIDINHO_ENV_FILE is sourced once after bun install and before doctor, so doctor, the unit/pidfile/command restart and every rollback restart (including after a failed bun install) see it; bun install does not. CORVIDINHO_BRIDGE_CMD runs with its text passed through the environment, so a pkill -f pattern in it cannot kill its own shell; docs/BOX-UPDATE.md pkill examples use an anchored pattern that matches the bridge process but not a shell holding the text.

## No-spec Rationale

Not applicable
