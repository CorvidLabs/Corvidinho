---
change: box-updater-a-set-corvidinho-bridge-unit-wins-over-a-leftover-pidfile-no-second-nohup-bridge-the-env-file-is-loaded
artifact: testing
---

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
