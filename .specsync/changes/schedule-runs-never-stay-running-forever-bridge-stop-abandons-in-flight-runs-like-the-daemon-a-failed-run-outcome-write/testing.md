---
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
artifact: testing
---

# Testing

Fixture tests only: temp git repos, temp SQLite files and data dirs, fake
`sh` agent bins through the real spawn client, and child Bun processes that
are killed with SIGKILL. No Discord, no network, no token.

`tests/scheduler.never-stuck.test.ts` (discord):

- **Write throws once.** `markRunFinished` throws `SQLITE_BUSY` on the first
  call: it is called twice, the row is `completed`, `onRunFinished` fires
  once with `ok: true`, and a "retrying once" line is logged.
- **Write throws twice.** One `[scheduler] run failed: could not record run
  …` line with `SQLITE_BUSY`, one `ok: false` event with "not recorded",
  in-memory failure count 1, slot freed, no unhandled rejection.
- **Bridge stop.** `startBridge` with a file DB, a git project and the spawn
  client on a sleeping fake agent; the scheduler interval starts the due run;
  `stop()` leaves the row `failed` (`interrupted: bridge shutdown`), the agent
  pid gone, and no `talk-schedule_*` worktree or `talk/schedule_*` branch.
- **Bridge start after kill -9.** Two child Bun runners each claim a run and
  create its worktree; one is SIGKILLed. `startBridge` marks that run
  `failed` (`interrupted: process restarted`, `completed_at` set) and removes
  its worktree; the live child's run stays `running` with its worktree and
  branch.
- **Schema v10.** A claimed run records `<pid>:<proc start>`; the store never
  recovers its own live run; a v9 DB (no `runner` column) with a leftover
  `running` row migrates to v10 and that row is recovered.

`tests/daemon.restart-recovery.test.ts` (cli):

- **Stop parks.** `startDaemon` + spawn client, grace 100 ms: after
  `stop("SIGTERM")` resolves the run is `failed` and its worktree and empty
  branch are gone.
- **Branch with commits kept.** The fake agent commits in its worktree before
  sleeping: after stop the worktree is gone and the branch (tip "agent work")
  is kept.
- **kill -9 daemon.** A child Bun daemon ticks the run and is SIGKILLed (its
  agent group killed too); the stale `daemon.lock` is taken over, the run is
  `failed` (`interrupted: process restarted`), worktree and branch are gone,
  and `daemon.recovered` names the run and 1 worktree.
- **Leftover of an ended run.** A run recorded failed with a worktree and
  branch named as the scheduler names them is cleaned at start; a
  `talk-someone-else` worktree and branch are untouched.
- **Another data dir's worktree (review fix).** A second data dir claims a
  run and creates its worktree with an uncommitted file; a daemon on a fresh
  data dir started with that worktree as its project root (what `bun test` /
  the verify lane inside a live schedule run does) leaves the worktree, the
  file and the branch alone. Fails on the first version of this change,
  which parked every schedule-run worktree whose run was not `running` in its
  own DB (unknown included): `bun test tests/daemon.cli.test.ts` in a checkout
  deleted every live schedule worktree registered with that repo.

Also updated: `tests/watch.session-store.durable.test.ts` and
`tests/discord.inflight-replies.test.ts` pin `SCHEMA_VERSION` (now 10).

## Before and after

- **Before** (`src/` from `main` bf9a5b2 — and 6e5370d before the rebase — same tests): 9 fail, 0 pass. Each
  fails on its assertion (row still `running`, no event, worktree/branch still
  listed); the schema test fails because `runner` does not exist.
- **After:** 9 pass. Related suites (`tests/scheduler.*`, `tests/daemon*`,
  `tests/discord.schedule`, `tests/discord.work-store.recovery`,
  `tests/discord.inflight-replies`, `tests/worktree*`, session-worktree,
  bridge tests) pass: 185 tests across 21 files.

Also run: `bunx tsc --noEmit`, `bun test`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-346` | `tests/scheduler.never-stuck.test.ts` | One throwing outcome write is retried and recorded `completed` with one event; two throwing writes log `[scheduler] run failed: could not record run …` and report `ok: false`; bridge `stop()` records the in-flight run `failed` (`interrupted: bridge shutdown`), kills the agent and removes worktree and branch; bridge start after `kill -9` fails the dead runner's run (`interrupted: process restarted`) and removes its worktree while a live runner's run and worktree stay; runner recorded and v9 → v10 migration recovers a runner-less row. |
| `REQ-discord-346` | `tests/daemon.restart-recovery.test.ts` | Daemon start recovery and the bounded settle after abandon remove worktrees and empty branches and keep a branch with commits. |
| `REQ-cli-108` | `tests/daemon.restart-recovery.test.ts` | Stop after the grace removes the abandoned run's worktree and empty branch before resolving (branch with commits kept); start after `kill -9` records the run failed, removes its worktree and logs `daemon.recovered`; start removes a leftover worktree of an ended run and leaves other worktrees alone; start never touches another data dir's schedule-run worktree. |
| `REQ-cli-108` | `tests/daemon.test.ts`, `tests/daemon.cli.test.ts` | Existing lock, tick, grace, forced stop, process-tree kill and CLI SIGTERM behaviour unchanged. |
| `REQ-discord-108` | `tests/scheduler.service.test.ts`, `tests/daemon.test.ts` | Atomic claim and one outcome per run unchanged; `abandonInFlight` still records once and aborts. |
| `REQ-discord-331` | `tests/scheduler.tick-errors.test.ts` | A run whose agent throws and whose `markRunFinished` always throws still logs `[scheduler] run failed:` and frees its slot with no unhandled rejection. |
