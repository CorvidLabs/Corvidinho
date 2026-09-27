---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.
- `tests/daemon.restart-recovery.test.ts` — daemon stop after the grace removes an abandoned schedule run's worktree and empty `talk/schedule_*` branch before it resolves, and keeps a branch with commits; a start after `kill -9` of a daemon mid-run fails that run (`interrupted: process restarted`), removes its worktree and branch and logs `daemon.recovered`; a start removes a leftover worktree of a run already recorded failed and leaves other worktrees alone; a start (even with that worktree as its project root) never touches a schedule-run worktree whose run another data dir owns, keeping its uncommitted files and branch (REQ-cli-108 / REQ-discord-346).
- `tests/scheduler.ask-outbox.test.ts` — `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) for a stuck schedule run and leaves its ask pending on the run row; a Discord bridge started later on the same data dir posts it to the owner once (REQ-cli-098 / REQ-discord-347).

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.
