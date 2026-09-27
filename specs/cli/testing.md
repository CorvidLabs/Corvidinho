---
spec: cli.spec.md
---

## Automated Tests

- `tests/cli.smoke.test.ts` — `--help` exits 0; `version` exits 0 with semver.
- `tests/cli.project-path.test.ts` (REQ-cli-505, CLI-5) — `parseGlobalFlags` takes `--project <path>` / `--project=<path>` before `--` only, never from `--task` text, `""` without a path; `readStartEnv` parses a NUL-separated environ block; `envFileFlags` keeps only Bun's `.env` flags, in order; `enterProject` on an unusable path leaves the cwd alone. CLI spawns started in temp dir A against temp project P: `task run --task "touch widget" --json` with `--project` before or after the command uses P's `fledge.toml` (verify off; A's keeps it on) and P's `widget` spec; `--project P doctor` prints exactly what `doctor` started in P prints (P's `.env.local` over `.env`, `$VAR` expanded, A's `.env` LLM key gone, never printed); `--project P specsync check` gives a fake `specsync` child P's `.env` values and none of A's, exactly as started in P; `bun --no-env-file` CLI `--project P doctor` prints what the same started in P prints (no P `.env`); a set env var wins over P's `.env`; a missing path, a file and an empty `--project` are one error line + hint, exit 1, nothing run (`--json`: `{ok:false,error}`).
- `tests/runners.plugins.test.ts` — `plugins list` (CLI spawn) with no toolchain on PATH exits 0 and prints `Language runners (PLUGIN-4): none loaded` and a `not loaded` line per runner; with only `cargo` on PATH it lists `cargo-exec` and its binary (REQ-cli-112 / REQ-plugins-314).
- `tests/daemon.restart-recovery.test.ts` — daemon stop after the grace removes an abandoned schedule run's worktree and empty `talk/schedule_*` branch before it resolves, and keeps a branch with commits; a start after `kill -9` of a daemon mid-run fails that run (`interrupted: process restarted`), removes its worktree and branch and logs `daemon.recovered`; a start removes a leftover worktree of a run already recorded failed and leaves other worktrees alone; a start (even with that worktree as its project root) never touches a schedule-run worktree whose run another data dir owns, keeping its uncommitted files and branch (REQ-cli-108 / REQ-discord-346).
- `tests/scheduler.ask-outbox.test.ts` — `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) for a stuck schedule run and leaves its ask pending on the run row; a Discord bridge started later on the same data dir posts it to the owner once (REQ-cli-098 / REQ-discord-347).
- `tests/daemon.test.ts` (REQ-cli-108, DISCORD-SCHEDULE-3) — after start, a channel removed from the allowlist file or a creator added to its `deny_users` is refused on the next tick without running the agent; a malformed file makes the tick log `tick.allowlist_failed` and run nothing, and the still-due schedule runs once the file is fixed; with a non-empty user list the configured owner's schedule still runs and an unlisted non-owner's is refused; a tick still re-reading the allowlist when stop begins claims no run. The fixture env blanks the operator's Discord user/role/deny lists and owner.

## Fixtures

- None; smoke spawns `bun src/cli.ts` against the repo root.

## Manual QA

- Run `bun src/cli.ts doctor` with and without Discord token env; confirm secret values never appear in output.
- Run `fledge lanes run verify --non-interactive` after CLI changes.
