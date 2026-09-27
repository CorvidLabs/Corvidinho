# Lesson bundle — schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule auto-pause and pre-run failures record a stuck ask on the run row so the owner is pinged once through the existing schedule ask post and the bridge delivery pass (AUTONOMY-2)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/scheduler/service.ts, src/scheduler/store.ts, tests/scheduler.ask-outbox.test.ts, tests/scheduler.service.test.ts, docs/discord.md, docs/DAEMON.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: A schedule run whose failure makes FAILURE_AUTO_PAUSE (5) in a row records, in the same run-finish write, a stuck ask on its schedule_runs row saying the schedule is paused and to resume it with /schedule resume (plus the run's own question when it had one); a run that cannot start because its project cannot be resolved or its worktree cannot be created is recorded failed with the full error and a stuck ask with fixed text (no host path); the bridge posts either ask in-process at once, or its next scheduler tick posts one a daemon run left pending, once, to the schedule channel with the owner pinged once per question, and the pausing run's ask replaces its plain failure post; a run refused by the DISCORD-SCHEDULE-3 gate still posts nothing and its pause ask waits until the gate passes; tests/scheduler.ask-outbox.test.ts and tests/scheduler.service.test.ts cover each and fail on the previous code

## Evidence

- Verification commit: `dc9a75ec1a5995dfa7c4e072a085aa7eaa36d943`
- Base commit: `fbaa84b7cda1bf2b462baea44cad20ef93e0df4f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Captured HI: **AUTONOMY-2** — "When stuck, it pings the configured owner on
Discord rather than dying silently." Issues #97, #104. Routing kept as is:
AUTONOMY-4 (stuck → owner), DISCORD-SCHEDULE-3 (creator + channel gate),
REQ-discord-418 (no host paths to non-owners), SAFE-6.

Gap on main (fbaa84b, after #238): `SchedulerService.maybeAutoPause` sets a
schedule `paused` after 5 failures in a row and posts nothing about it: the
bridge posts the pausing run's plain `❌ … failed (exit 1)` line with no
ping, and a daemon-claimed run posts nothing at all; the only consumer of
`onRunFinished.autoPaused` is the daemon's `run.finished` log line. The
`project resolve failed` and `worktree failed` branches of `runOne` call
`finish()` and return before any post, so a schedule whose project or
worktree is broken fails every tick, then pauses, without a word on Discord.

Constraints: reuse the REQ-discord-347 path (run-row ask, in-process post,
bridge delivery pass) — no new post path, no daemon posting (AUTONOMOUS-7
daemon-only box posting is an open Leif question). No schema bump, no new
slash command, env var or config key. The resolve / worktree errors carry
host paths, so the posted question must not include them.

Out of scope: a run that throws before recording (the `catch` in `runOne`)
still records no ask of its own (it counts toward the pause, whose ask is
posted); DISCORD-SCHEDULE-3 refusals stay silent by design; open PRs #232 and
#233 are untouched.

## From the change's design.md

# Design

- `ScheduleStore.markRunFinished(schedule, run, result)`: `result` gains
  optional `autoPause: { at: number; ask: HumanAsk }`. Inside the existing
  IMMEDIATE transaction, after the SQL `consecutive_failures` update, the
  run row stores `autoPause.ask` (scrubbed, capped) instead of
  `result.ask` when the run failed and the SQL count is `>= at`; the
  memory store uses its own count. The decision uses the same count
  `maybeAutoPause` then reads, so the ask and the pause agree even when a
  cached row is stale (two tickers). No new column: `ask_reason` /
  `ask_question` / `ask_posted_at` from schema v11.
- `SchedulerService`:
  - exports `PROJECT_RESOLVE_FAILED_QUESTION`, `WORKTREE_FAILED_QUESTION`
    (fixed, path-free text) and `autoPauseAsk(last?)` (pause line +
    `/schedule resume`, plus `Last failure: <question>` of the run's own
    ask);
  - `finish()` passes `autoPause: { at: FAILURE_AUTO_PAUSE, ask }` for a
    failed run and returns `null` (already recorded) or `{ ask? }`: the
    auto-pause ask when `maybeAutoPause` paused, else the run's own ask;
    `onRunFinished.askReason` follows it;
  - `failBeforeRun` records the two pre-run failures with the full error
    and a stuck ask, then posts it (a resolve / worktree step that throws
    is caught into the same branch); `postOwnRunAsk` is the in-process post
    of REQ-discord-347 (live gate, take the recorded ask, `postRunAsk`),
    now shared by the pre-run branches, the normal path and a run that
    throws. The normal path posts `done.ask` when there is one, else the
    ✅/❌ line as before; for a pause ask of a run without its own ask the
    context is the `failed (exit N)` line the ❌ post showed. `finish()`
    also returns `autoPaused`, and `postOwnRunAsk({ handBack })` releases a
    pause ask whose post did not go out, so the next delivery pass retries
    it (a paused schedule has no next run; other own-run asks keep the
    REQ-discord-347 "not retried" rule).
- Daemon and bridge wiring are unchanged: the daemon already logs
  `run.needs_human` from `askReason`, the bridge's delivery pass already
  posts any pending run ask.
- Rejected: a separate post or a new DM/channel for the pause (the captured
  text only asks for the owner ping; REQ-discord-347 already routes stuck
  asks to the owner); writing the pause ask in a second statement after the
  run-finish write (another ticker could take the run's own ask in between,
  so the owner would get two posts); predicting the pause from the cached
  failure count (a stale cache would pause silently again); posting the
  resolve / worktree error text (host paths, REQ-discord-418); a new config
  key for the threshold or the text (not captured).

## From the change's testing.md

# Testing

Fixture tests only: in-memory SQLite, injected agents, temp dirs and a temp
git repo for the pre-run failures; no live Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-353` (auto-pause) | `tests/scheduler.ask-outbox.test.ts` | Daemon + bridge on one DB: 4 daemon failures record no ask and post nothing; the 5th pauses the schedule, stores `ask_reason` `stuck` with `autoPauseAsk().question` and `ask_posted_at` null, `onRunFinished` `{ autoPaused: true, askReason: "stuck" }`; the bridge's next tick posts it once (prefix, stuck headline, `<@owner>`, pause line, `failed (exit 1)` context, `mentionUserIds` [owner]); two more ticks post nothing. A STUCK 5th run posts one ask: pause line + `Last failure: <question>`. Bridge-claimed: 4 silent `❌` posts, then the pause ask with the owner ping and the `failed (exit 1)` context, never the run's output `boom` (no `❌`), ping key recorded, not posted again. Bridge-claimed pause ask whose post resolves `false`, and again one whose post throws: nothing posted, `ask_posted_at` null, no ping key; the next tick posts it once with the ping. A bridge run that throws on the 5th failure: the pause ask posts at once with the ping and without the spawn error's host path. 5 creator-refused runs: 0 agent calls, 0 posts, pause ask pending; once the creator is listed the next tick posts it with the ping. |
| `REQ-discord-353` (pre-run failures) | `tests/scheduler.ask-outbox.test.ts` | Daemon run with a missing project (worktrees on, temp root): 0 agent calls, row error `project resolve failed: project path not found: missing-proj …` (with the temp root), ask `PROJECT_RESOLVE_FAILED_QUESTION`; the bridge posts it with the owner ping and without the temp root; a second identical failure posts without a ping. Bridge run on a temp git repo with a `talk` branch (blocks `talk/<run>`): 0 agent calls, row error `worktree failed: Failed to create worktree: …`, ask `WORKTREE_FAILED_QUESTION` posted at once with the owner ping, without the temp root, once. A worktree step that throws (`WORKTREE_BASE_DIR` under a regular file, ENOTDIR): same row error prefix, same ask and post. |
| `REQ-discord-353` (SQL count) | `tests/scheduler.service.test.ts` | A store handle whose cached count is stale: at SQL count 4 the run keeps its own ask; at 5 it stores the pause ask (row and cached run); a success stores no ask and resets the count to 0. |
| `REQ-discord-347`, `REQ-discord-020`, `REQ-discord-108`, `REQ-cli-098` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.actor-gate.test.ts`, `tests/scheduler.claim.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts` | The existing outbox, gate, claim, ask-ping and spend suites pass unchanged. |

Fail-on-main proof: with main's `src/scheduler/service.ts` (plus only the
three new text exports appended) and main's `src/scheduler/store.ts`, all 10
new tests fail and the 20 existing tests in the two files pass; with the
branch sources all 30 pass. The review's 3 added tests and the added
context assertions also fail on the first draft of this change (a pause
ask claimed and never handed back, a thrown pause run posted only on the
next tick, a throwing worktree step recorded with no ask, the raw run
output as context).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
