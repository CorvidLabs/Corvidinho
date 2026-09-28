# Lesson bundle — schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree
- **Kind**: BugFix
- **Specs**: discord, cli
- **Paths**: src/scheduler/service.ts, src/scheduler/store.ts, src/scheduler/index.ts, src/discord/bridge.ts, src/store/db.ts, src/daemon/daemon.ts, tests/scheduler.never-stuck.test.ts, tests/daemon.restart-recovery.test.ts, tests/discord.inflight-replies.test.ts, tests/watch.session-store.durable.test.ts, docs/DAEMON.md, docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md
- **Acceptance**: Bridge stop records an in-flight schedule run failed ('interrupted: bridge shutdown'), kills its agent tree and removes its worktree and empty talk/schedule_* branch; a run-outcome write that throws once is retried and recorded, and one that throws twice is logged '[scheduler] run failed: could not record run ...' and reported as failed; bridge and daemon start mark runs a dead process (kill -9) left running as failed 'interrupted: process restarted' and remove leftover schedule-run worktrees (a branch with commits is kept), while a run another live process owns and its worktree are untouched; daemon stop waits a bounded grace so an abandoned run's worktree is gone before it exits; tests/scheduler.never-stuck.test.ts and tests/daemon.restart-recovery.test.ts cover each and fail on the previous code

## Evidence

- Verification commit: `3e068e67c5c37233dc5ef71555efe6ca4ac2b3bb`
- Base commit: `bf9a5b20b2a13f77eb503567428ff5551321bc9c`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Two read-only end-to-end checks of `main` found that schedule runs can stay
`running` forever and leak worktrees (bridge report defect 4; long-running
report D1, D2, D3). All four still reproduced on `main` 6e5370d and again on
`main` bf9a5b2 (v0.0.26, after #160 spend cap), which already have #185
(abort controllers for abandoned runs) and #193 (tick catch,
REQ-discord-331); none was already fixed.

- (a) Bridge stop. `startBridge().stop()` only called `scheduler.stop()`. The
  daemon calls `abandonInFlight`, the bridge never did, so a run in flight at
  SIGTERM stayed `running` in `schedule_runs`, even after a restart
  (REQ-discord-108 says every outcome is recorded once).
- (b) Outcome write. `SchedulerService.finish()` added the run to
  `finishedRuns` before `store.markRunFinished()`. When the write threw
  (`SQLITE_BUSY` past the 5 s busy timeout, e.g. an agent holding the DB
  lock), `runOne`'s catch called `finish()` again, which returned false: the
  error was swallowed, nothing was logged, no `run.finished`, no
  `consecutive_failures` update, and the row stayed `running`.
- (c) Crash. After `kill -9` of the bridge or daemon, nothing at start fixed
  rows left `running`. `/work` has start-up recovery
  (`WorkStore.recoverAbandoned`, SESSION-WORKTREE-3); schedules had none.
- (d) Worktrees. `stop()` never awaited the abandoned run's `settled`
  promise, so `runOne`'s `finally` (which parks the worktree) never ran before
  `process.exit`. Every run abandoned at shutdown left
  `talk-schedule_<schedule>_<run>` and `talk/schedule_<schedule>_<run>`
  behind (unique names, so they pile up), and nothing cleaned them at start.

Constraint that shaped the fix: a bridge and `corvidinho daemon` may share
one data dir (CLI-8 / AUTONOMOUS-4, REQ-discord-108). A blind "fail every
running row at start" (the `/work` pattern) would fail the other live
process's run and `git worktree remove --force` its live cwd. So each run now
records its runner (`<pid>:<proc start>`, schema v10) and recovery only
touches runs whose runner is gone.

Captured HI served: CLI-8, AUTONOMOUS-4 (schedules keep ticking unattended),
DISCORD-SCHEDULE-2 (listed history is honest) and DISCORD-SCHEDULE-4 (no
change to the non-blocking tick), SESSION-WORKTREE-3 (an abandoned run's
worktree is parked, never silently left). No new env var, slash command or
CLI flag.

## From the change's design.md

# Design

- `ScheduleStore`:
  - `markRunFinished` runs its writes in one `db.transaction(...).immediate()`
    (write lock up front so busy_timeout applies; a failed attempt changes
    nothing) and updates the cached run/schedule only after it commits.
  - `claimRun` writes `runner` = `scheduleRunnerId()` (`<pid>:<proc start>`;
    constructor option `runner` for tests). Schema v10 adds
    `schedule_runs.runner TEXT` (additive `ALTER TABLE`, same pattern as v7/v8).
  - `recoverAbandonedRuns(now, isAlive)`: `running` rows whose runner is null
    or not alive (`isScheduleRunnerAlive` → `isHolderAlive`) are set `failed`,
    error `RUN_INTERRUPTED_BY_RESTART`, `completed_at` (guarded by
    `AND status = 'running'`). Counters untouched. No-op for the memory store.
  - `runRecord(runId)` (status + schedule id) and a `durable` getter for the
    worktree scan.
- `SchedulerService`:
  - `finish()`: write first; on throw log "retrying once" and retry; on a
    second throw log `[scheduler] run failed: could not record run …`, mark
    the cached run failed, bump the in-memory failure count, report
    `ok: false` ("run outcome not recorded: …"). Only then add to
    `finishedRuns`. `runOne`'s catch logs the error when `finish()` returns
    false instead of dropping it.
  - `abandonInFlight` wraps `finish()` in try/catch so the abort always
    happens, and keeps each aborted run's `settled` promise in a set;
    `settleAbandoned(ms)` waits for them (bounded), `ABANDONED_SETTLE_MS`
    = 3 000.
  - `recoverAbandoned()`: store recovery, then (durable store and worktrees
    on) for the default project root and each schedule's resolved project
    that is a git repo, `git worktree list --porcelain`; entries named
    exactly `talk-schedule_<s>_<srun_…>` on branch `talk/schedule_<s>_<srun_…>`
    whose run this data dir recorded (`runRecord`), under that schedule, as
    not `running` go through `parkWorktree(kind: "worktree")`. A run the data
    dir does not know is another data dir's (a second bridge/daemon, or
    `bun test` inside a live schedule worktree) and is never touched.
    Errors are logged (`[scheduler] recovery failed: …`), never thrown; a
    failed row recovery skips the worktree scan.
- Bridge: `recoverAbandoned()` right after the scheduler is built (before the
  gateway and the first tick), one `[discord] restart recovery:` line;
  `stop()` → `scheduler.stop()` → `abandonInFlight("interrupted: bridge
  shutdown")` → `settleAbandoned(3 s)` → `gateway.stop()`. No drain grace:
  the bridge stop stays fast (the updater escalates to SIGKILL after 5 s).
- Daemon: `recoverAbandoned()` before arming the interval, `daemon.recovered`
  (warn) after `daemon.started`; `stop()` awaits `settleAbandoned(3 s)` after
  `daemon.abandoned`, before closing the DB. A second signal does not skip it.
- Rejected: parking a schedule-run worktree whose run is unknown to this
  data dir (review finding: a daemon or bridge started from any checkout,
  including `tests/daemon.cli.test.ts` in the verify lane, deleted other data
  dirs' live schedule worktrees and uncommitted work). A leftover of a run
  whose schedule was deleted after a crash is left instead.
- Rejected: failing every `running` row at start (kills a live daemon's run
  and worktree when a bridge restarts on the same data dir); racing the
  settle with the second signal (double SIGTERM would leak worktrees again).

## From the change's testing.md

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
- **Another data dir's worktree, bridge (review fix).** A second data dir
  claims a run and creates its worktree with an uncommitted file; a bridge on
  its own data dir started with that worktree as its project root leaves the
  worktree, the file and the branch alone. Fails on the first version of
  this change.
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
- **Review fix:** the two "another data dir's worktree" guards (daemon and
  bridge) fail on the first version of this change (a57778e: the worktree,
  its uncommitted file and its branch are removed) and pass on `main`, which
  has no start-up worktree cleanup at all.
- **After:** all 11 pass. Related suites (`tests/scheduler.*`, `tests/daemon*`,
  `tests/discord.schedule`, `tests/discord.work-store.recovery`,
  `tests/discord.inflight-replies`, `tests/worktree*`, session-worktree,
  bridge tests) pass: 185 tests across 21 files.

Also run: `bunx tsc --noEmit`, `bun test`, `specsync check
--require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-346` | `tests/scheduler.never-stuck.test.ts` | One throwing outcome write is retried and recorded `completed` with one event; two throwing writes log `[scheduler] run failed: could not record run …` and report `ok: false`; bridge `stop()` records the in-flight run `failed` (`interrupted: bridge shutdown`), kills the agent and removes worktree and branch; bridge start after `kill -9` fails the dead runner's run (`interrupted: process restarted`) and removes its worktree while a live runner's run and worktree stay; runner recorded and v9 → v10 migration recovers a runner-less row; a bridge start never touches another data dir's schedule-run worktree. |
| `REQ-discord-346` | `tests/daemon.restart-recovery.test.ts` | Daemon start recovery and the bounded settle after abandon remove worktrees and empty branches and keep a branch with commits. |
| `REQ-cli-108` | `tests/daemon.restart-recovery.test.ts` | Stop after the grace removes the abandoned run's worktree and empty branch before resolving (branch with commits kept); start after `kill -9` records the run failed, removes its worktree and logs `daemon.recovered`; start removes a leftover worktree of an ended run and leaves other worktrees alone; start never touches another data dir's schedule-run worktree. |
| `REQ-cli-108` | `tests/daemon.test.ts`, `tests/daemon.cli.test.ts` | Existing lock, tick, grace, forced stop, process-tree kill and CLI SIGTERM behaviour unchanged. |
| `REQ-discord-108` | `tests/scheduler.service.test.ts`, `tests/daemon.test.ts` | Atomic claim and one outcome per run unchanged; `abandonInFlight` still records once and aborts. |
| `REQ-discord-331` | `tests/scheduler.tick-errors.test.ts` | A run whose agent throws and whose `markRunFinished` always throws still logs `[scheduler] run failed:` and frees its slot with no unhandled rejection. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
