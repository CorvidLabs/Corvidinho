# Lesson bundle — box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Box updater: a set CORVIDINHO_BRIDGE_UNIT wins over a leftover pidfile (no second nohup bridge), the env file is loaded once before doctor and every restart/rollback path, and CORVIDINHO_BRIDGE_CMD runs with its text off the shell argv so pkill -f cannot kill its own shell
- **Kind**: BugFix
- **Specs**: cli
- **Paths**: scripts/corvidinho-update.sh, tests/update-helpers.test.ts, docs/BOX-UPDATE.md
- **Acceptance**: With CORVIDINHO_BRIDGE_UNIT set, a leftover pidfile no longer selects pidfile mode: the updater runs systemctl restart and starts no nohup bridge; a stale pidfile is removed and a live pid in it is never signalled. Without a unit, a leftover pidfile still selects pidfile mode. CORVIDINHO_ENV_FILE is sourced once after bun install and before doctor, so doctor, the unit/pidfile/command restart and every rollback restart (including after a failed bun install) see it; bun install does not. CORVIDINHO_BRIDGE_CMD runs with its text passed through the environment, so a pkill -f pattern in it cannot kill its own shell; docs/BOX-UPDATE.md pkill examples use an anchored pattern that matches the bridge process but not a shell holding the text.

## Evidence

- Verification commit: `3bf0d9c8a9cbd4c9b8986a1b01042dc17d5202fc`
- Base commit: `2ff0598784b5e7c72f2c0eedbb85131324e7e239`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

A crash/restart-recovery audit of `origin/main` confirmed three bugs in the shipped box updater
`scripts/corvidinho-update.sh` (operator contract: `docs/BOX-UPDATE.md`):

1. `want_pidfile()` checked for an existing pidfile before `CORVIDINHO_BRIDGE_UNIT`. On a box with a
   systemd bridge unit, a leftover `/tmp/corvidinho-discord-bridge.pid` made the updater skip
   `systemctl` and `nohup`-start a second bridge next to the unit's (every mention handled twice);
   because it rewrote the pidfile, every later update stayed in pidfile mode.
2. `CORVIDINHO_ENV_FILE` was sourced only inside the pidfile start. `doctor` ran with whatever env the
   shell had (a cron/non-login run with secrets only in the env file failed doctor and rolled back
   every time), and unit/command restarts, including rollback restarts, never saw the file.
3. The documented `CORVIDINHO_BRIDGE_CMD` example (`pkill -f 'discord bridge' || true; nohup …`) ran as
   `bash -lc "$BRIDGE_CMD"`, so the pattern was on the shell's own argv: `pkill` killed that shell
   (exit 143, reproduced), the new bridge never started and the update rolled back with the bridge down.

Fix scope is the script, its tests and `docs/BOX-UPDATE.md`. Explicit `CORVIDINHO_USE_PIDFILE=1` still
forces pidfile mode; with no unit a leftover pidfile still selects pidfile mode. Rollback still does not
re-run `CORVIDINHO_BRIDGE_CMD` (unchanged; out of scope). The env file is loaded after `bun install` so
secrets stay out of fetch/install.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-347` | `tests/update-helpers.test.ts` (explicit unit wins over a leftover stale pidfile) | unit + dead-pid pidfile: `systemctl restart` runs, no `discord bridge` start, pidfile removed. Fails on main (pidfile mode). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (unit mode never signals a live pid) | unit + live `sleep` pid in pidfile: systemctl used, pid still alive, "ignoring" logged. Fails on main (pid SIGTERMed, nohup bridge). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (leftover pidfile without a unit keeps pidfile mode) | no unit/cmd + pidfile: nohup bridge started with env, no systemctl. Guard; passes before and after. |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (env file loaded before doctor and the unit restart) | doctor and `systemctl restart` see the env-file mark; `bun install` does not. Fails on main (doctor unset, rollback). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (rollback after a failed bun install) | rollback's `systemctl restart` sees the env-file mark. Fails on main (unset). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (rollback restart sees the env file) | doctor failure, then rollback `systemctl restart` sees the mark. Fails on main (unset). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (BRIDGE_CMD pkill -f cannot kill its own shell) | unique-token `pkill -f` in BRIDGE_CMD: command completes with env mark, exit 0, no rollback. Fails on main (shell killed, rollback). |
| `REQ-cli-347` | `tests/update-helpers.test.ts` (documented pkill patterns) | every `pkill -f '…'` in docs/BOX-UPDATE.md matches bridge command lines but not a `bash -lc` holding the text (ERE, as pgrep). Fails on main. |

## Before / after

- Before (origin/main script + docs, new tests): 25 pass, 7 fail (all seven new REQ-cli-347 regression tests).
- After: 32 pass, 0 fail.

Tests use a temp dir, a unique pkill token and a clean env; they never restart or signal a real bridge.

## Where these lessons go

- `specs/cli/context.md`
