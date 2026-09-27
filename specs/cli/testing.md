---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.
- `tests/daemon.restart-recovery.test.ts` — daemon stop after the grace removes an abandoned schedule run's worktree and empty `talk/schedule_*` branch before it resolves, and keeps a branch with commits; a start after `kill -9` of a daemon mid-run fails that run (`interrupted: process restarted`), removes its worktree and branch and logs `daemon.recovered`; a start removes a leftover worktree of a run already recorded failed and leaves other worktrees alone; a start (even with that worktree as its project root) never touches a schedule-run worktree whose run another data dir owns, keeping its uncommitted files and branch (REQ-cli-108 / REQ-discord-346).
- `tests/daemon.test.ts` (REQ-cli-108, DISCORD-SCHEDULE-3) — after start, a channel removed from the allowlist file or a creator added to its `deny_users` is refused on the next tick without running the agent; a malformed file makes the tick log `tick.allowlist_failed` and run nothing, and the still-due schedule runs once the file is fixed; with a non-empty user list the configured owner's schedule still runs and an unlisted non-owner's is refused. The fixture env blanks the operator's Discord user/role/deny lists and owner.

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.
