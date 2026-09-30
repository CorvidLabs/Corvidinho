---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: tasks
---

# Tasks

- [x] Research: every path from a scheduled run to a remote repo (GitHub tools, review and docs readers, web-fetch, git, files / search, shell, the project dir).
- [x] `SCHEDULE_SESSION_PREFIX` / `isScheduleRunEnv` (`src/plugins/roles.ts`); the scheduler's session id from the constant (`src/scheduler/service.ts`).
- [x] Schedule-run allowlist step in `checkRepoGateForActingRole` (`src/plugins/githubPublic.ts`).
- [x] Per-hop GitHub-host rule and `githubRepoOfUrl` (`plugins/web/fetch.ts`); the handler passes the run's env (`plugins/web/commands.ts`).
- [x] `resolveProjectDir` option `schedule` (`src/worktree/manager.ts`), passed by `/schedule create` and every tick.
- [x] Tests: `tests/github.schedule-repo-gate.test.ts` (17) and three nested-checkout cases in `tests/worktree.project-scope.test.ts`; existing nested schedule projects get an allowlisted origin.
- [x] Fail-on-base proof (base roles / githubPublic / fetch / commands / manager / schedule handler / scheduler swapped in: 13 of the 20 new tests fail; restored: all pass).
- [x] Docs: `docs/discord.md` (Schedule repos row, nested-checkout scope, upgrade note, roles bullet), `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`.
- [x] Spec: deltas (REQ-plugins-496 Added; REQ-plugins-065 / -493 / -111 and REQ-discord-202 Modified), `plugins.spec.md` / `discord.spec.md` prose, scenarios, error cases, files list; both `testing.md` companions.
- [x] SpecSync approve / check / audit, coverage, `hi check`, tsc, `bun test`, fledge verify.
