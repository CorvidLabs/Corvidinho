---
module: discord
change: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
---

# Delta — discord (schedule runs never stay "running" forever)

## Added

### REQUIREMENT REQ-discord-346

A schedule run SHALL NOT stay `running` forever, and SHALL NOT leave its
worktree behind, when the process running it stops, crashes or cannot write
its outcome (DISCORD-SCHEDULE-2 / DISCORD-SCHEDULE-4 / SESSION-WORKTREE-3 /
CLI-8 / AUTONOMOUS-4).

- Outcome write. `SchedulerService` SHALL treat a run as recorded only after
  `markRunFinished` succeeds. A write that throws (for example
  `SQLITE_BUSY` past the 5 s busy timeout) SHALL be logged to stderr
  (scrubbed, one line) and retried once. If the retry also throws, the
  scheduler SHALL log `[scheduler] run failed: could not record run <run> of
  schedule <schedule> …`, count the run as failed (`onRunFinished` with
  `ok: false` and a "run outcome not recorded" error, and the in-memory
  failure count) and leave the row to start-up recovery. An error that reaches
  a run's catch after its outcome was already recorded SHALL be logged as
  `[scheduler] run failed: <message>`, never swallowed. `markRunFinished`
  SHALL write the schedule's failure counter and the run row in one
  IMMEDIATE transaction, so a retried write never counts a failure twice.
- Bridge stop. The Discord bridge's `stop()` SHALL, like the daemon, record
  every schedule run still in flight as failed (`interrupted: bridge
  shutdown`) through `abandonInFlight`, which aborts the run's agent process
  tree (REQ-discord-108). Nothing is posted for an abandoned run.
- Bounded settle. After `abandonInFlight`, the bridge and the daemon SHALL
  wait up to 3 s (`settleAbandoned(ABANDONED_SETTLE_MS)`) for the aborted
  runs to park their worktree and delete their empty `talk/schedule_*`
  branch before the stop resolves.
- Runner. Each claimed run SHALL record the process running it in
  `schedule_runs.runner` as `<pid>:<Linux /proc start time>` (schema v10),
  so a recycled pid never passes for a process that died.
- Start-up recovery. Before its first tick, the bridge (when its scheduler is
  enabled) and `corvidinho daemon` SHALL run `recoverAbandoned()`:
  - every `running` row whose runner is gone, or not recorded (rows from
    before v10), SHALL be marked `failed` with error `interrupted: process
    restarted` and a completion time;
  - every schedule-run worktree (`talk-schedule_<schedule>_<run>` checked out
    on `talk/schedule_<schedule>_<run>`) registered in the default project
    root or a schedule's project whose run this data dir recorded, under that
    schedule, as no longer `running` SHALL be parked with the existing safe
    cleanup: the branch is deleted only when it has no commits off the project
    HEAD (`branchHasOwnCommits`), otherwise kept;
  - a run whose runner process is alive (another bridge or daemon on the same
    data dir) and its worktree SHALL be left alone;
  - a schedule-run worktree whose run this data dir does not know SHALL NOT
    be touched: it belongs to another data dir sharing the repo (another
    bridge or daemon, or `bun test` / the verify lane run inside a live
    schedule worktree), and worktrees with other names SHALL NOT be touched
    either.
  Recovery changes only the run row, not the schedule's counters, and never
  throws (errors are logged). The bridge logs one `[discord] restart
  recovery:` line when it fixed something.

Existing behaviour is unchanged: the 60 s poll, max 2 concurrent runs, no
catch-up, auto-pause after 5 failures, the atomic claim (REQ-discord-108) and
the non-blocking tick (REQ-discord-331). No new env var, slash command or CLI
flag.

Acceptance Criteria
- `markRunFinished` throwing once: the run row is `completed`, `onRunFinished` fires once with `ok: true`, and a "retrying once" line is logged.
- `markRunFinished` throwing twice: `[scheduler] run failed: could not record run …` is logged, `onRunFinished` fires once with `ok: false` and "not recorded", the in-memory failure count is 1, the slot is freed and nothing rejects.
- Bridge `stop()` with a schedule run in flight (real spawn client, fake `sh` agent) records it `failed` with `interrupted: bridge shutdown`, the agent is gone, and its worktree and empty branch are removed.
- Bridge start after a `kill -9` of a process that was running a schedule run marks that run `failed` (`interrupted: process restarted`) and removes its worktree; a run another live process owns stays `running` with its worktree and branch.
- A claimed run records `<pid>:<proc start>`; a v9 DB migrates to v10 keeping its rows, and a `running` row without a runner is recovered.
- A daemon or bridge start never touches a schedule-run worktree whose run its data dir does not know (another data dir's run), even when started with that worktree as its project root: the worktree, its uncommitted files and its branch stay.
- Each case above except the last guard fails on the code before this change; the guard fails on the first version of this change.
