---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.
- `tests/runners.plugins.test.ts` — `plugins list` (CLI spawn) with no toolchain on PATH exits 0 and prints `Language runners (PLUGIN-4): none loaded` and a `not loaded` line per runner; with only `cargo` on PATH it lists `cargo-exec` and its binary (REQ-cli-112 / REQ-plugins-314).
- `tests/daemon.restart-recovery.test.ts` — daemon stop after the grace removes an abandoned schedule run's worktree and empty `talk/schedule_*` branch before it resolves, and keeps a branch with commits; a start after `kill -9` of a daemon mid-run fails that run (`interrupted: process restarted`), removes its worktree and branch and logs `daemon.recovered`; a start removes a leftover worktree of a run already recorded failed and leaves other worktrees alone; a start (even with that worktree as its project root) never touches a schedule-run worktree whose run another data dir owns, keeping its uncommitted files and branch (REQ-cli-108 / REQ-discord-346).
- `tests/scheduler.ask-outbox.test.ts` — `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) for a stuck schedule run and leaves its ask pending on the run row; a Discord bridge started later on the same data dir posts it to the owner once (REQ-cli-098 / REQ-discord-347).
- `tests/daemon.test.ts` (REQ-cli-108, DISCORD-SCHEDULE-3) — after start, a channel removed from the allowlist file or a creator added to its `deny_users` is refused on the next tick without running the agent; a malformed file makes the tick log `tick.allowlist_failed` and run nothing, and the still-due schedule runs once the file is fixed; with a non-empty user list the configured owner's schedule still runs and an unlisted non-owner's is refused; a tick still re-reading the allowlist when stop begins claims no run. The fixture env blanks the operator's Discord user/role/deny lists and owner.

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.
