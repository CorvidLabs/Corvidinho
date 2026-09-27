# Lesson bundle — daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Daemon-claimed schedule asks reach Discord: the run row records the ask and the bridge's scheduler tick posts it once (AUTONOMY-2 / AUTONOMOUS-7 needs-human outbox)
- **Kind**: Feature
- **Specs**: discord, cli
- **Paths**: src/store/db.ts, src/store/scrub.ts, src/scheduler/store.ts, src/scheduler/service.ts, src/daemon/daemon.ts, src/discord/bridge.ts, docs/DAEMON.md, docs/BOX-UPDATE.md, docs/DISCORD-GO-LIVE.md, tests/scheduler.ask-outbox.test.ts, tests/scheduler.never-stuck.test.ts, tests/watch.session-store.durable.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md
- **Acceptance**: A schedule run corvidinho daemon claims that stops with a stuck, clarify or spend-cap ask records the ask (reason + SAFE-6 scrubbed question) on its schedule_runs row (schema v11) and still logs run.needs_human; the bridge's next scheduler tick posts it once to the schedule's allowlisted channel with the schedule prefix and question, pinging the owner for stuck and spend-cap (once per question, and once per cap episode) and the schedule creator for clarify, carrying a pending 80% warning; only the newest pending ask of a schedule posts, none once a later run finished or the schedule was deleted; a refused channel posts nothing, a post that does not go out is retried next tick, a run the bridge posted is never posted again and two tickers never double-post; tick() never waits for delivery; tests/scheduler.ask-outbox.test.ts covers each and fails on the previous code

## Evidence

- Verification commit: `f87742bd25e9f03845c4f78e3e829cbb949bf707`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Captured HI: **AUTONOMY-2** ("When stuck, it pings the configured owner on
Discord rather than dying silently") and **AUTONOMOUS-7** ("When autonomous
work needs a human, it can reach me through the configured owner channel
(Discord) instead of dying quietly"). Issues #97, #104. The routing rules
kept as they are: AUTONOMY-4 (clarify → requester, stuck → owner) and SAFE-8
(a spend-cap ask pings the owner once per cap episode).

Gap on main (fc0ed8d): `src/daemon/daemon.ts` builds `SchedulerService`
with no owner and no outbound, so a schedule run the headless daemon claims
(AUTONOMOUS-4) that stops with a stuck, clarify or spend-cap ask posts
nothing. The only trace is the `run.needs_human` warn log line (reason, no
question); the run row stores only `failed (exit 1)`, so the question is
lost, and a bridge on the same data dir (the documented pairing that splits
due runs between the two) never delivers it. docs/DAEMON.md said so: "A run
the daemon claims is only recorded in the run history".

Constraints: REQ-cli-108 — the daemon runs with no Discord token, so it must
hand the ask to the bridge, not post it. DISCORD-SCHEDULE-4 — a tick must
not wait on slow work. SAFE-6 — the model-written question is stored at
rest, so it is scrubbed and listed in `SCRUB_TARGETS`. No new slash command,
env var, DM or channel. This slice owns schema v11.

Out of scope: WATCH stuck runs (hi/watch.md keeps WATCH answers on GitHub),
delegate workers (their ask reaches the lead, which can ask-human), and a
daemon posting on its own (would change REQ-cli-108; question for Leif).

## From the change's design.md

# Design

- Schema v11 (`src/store/db.ts`): `schedule_runs` gains `ask_reason TEXT`,
  `ask_question TEXT`, `ask_posted_at INTEGER` (additive `ALTER TABLE`, the
  v7/v8/v10 pattern) and a partial index
  `idx_schedule_runs_pending_ask(schedule_id) WHERE ask_reason IS NOT NULL
  AND ask_posted_at IS NULL`. Rows from before v11 have no ask, so an
  upgrade never posts history. `SCRUB_TARGETS` adds `ask_question`.
- `ScheduleStore`:
  - `markRunFinished` takes an optional `ask` and writes `ask_reason` and
    the scrubbed question (capped at `ASK_QUESTION_MAX`), `ask_posted_at`
    NULL, in the same IMMEDIATE transaction; the cached run gets `ask`.
  - `pendingAsks()`: per schedule, the newest finished run (by
    `completed_at`, rowid tie-break) when it has an untaken ask; older
    pending asks are moot. Memory store mirrors it over its cached runs.
  - `claimRunAsk(runId, now)`: `UPDATE … SET ask_posted_at = ? WHERE id = ?
    AND ask_reason IS NOT NULL AND ask_posted_at IS NULL`; `releaseRunAsk`
    clears it.
- `SchedulerService`:
  - the ask post moves into `postRunAsk(schedule, channelId, ask, context,
    spendWarning?)` (same `askPingKey` / `askPingOwner` / `formatAskReply`
    / `takeSpendWarning` / release logic as before, returns whether it went
    out);
  - `runOne` (bridge) claims its own run's ask right after `finish()` (no
    await in between) and posts it; a failed in-process post is not
    released (today's behaviour). An outcome that could not be recorded
    (write failed twice) has no row, so it posts without a claim, as before;
  - `tick()` ends with `deliverPendingAsks()`: only with an outbound, one
    pass at a time, not awaited; for each pending ask whose schedule still
    exists with a channel the allowlist allows → claim → `postRunAsk` with
    the run's stored summary as context → release when the post resolves
    `false` or throws (logged `[scheduler] ask failed: …`).
    `settleAskDelivery()` lets callers (tests) await the pass.
  - `finish()` carries the whole ask to `markRunFinished`; `onRunFinished`
    still reports only `askReason`.
- Daemon: no code change beyond the comment; it has no outbound, so it never
  claims or posts. Bridge: no change (its scheduler already has owner,
  outbound and the spend outbox).
- Rejected: the daemon posting through a Discord REST token (changes
  REQ-cli-108); retrying a failed in-process bridge post (double posts next
  to the next run's own post and breaks the pinned SAFE-8 test); posting
  every pending ask of a schedule (stale questions); an age cap or a new
  config key (not captured).

## From the change's testing.md

# Testing

Fixture tests only: in-memory and temp-file SQLite, injected agents, a null
gateway through `startBridge`; no live Discord, no network, no token, no git
worktrees.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | Daemon-wired + bridge-wired schedulers on one DB: a daemon stuck run stores `ask_reason` `stuck`, the question and `ask_posted_at` null and posts nothing; the bridge's next tick posts it once (prefix, "I'm stuck" headline, question, `<@owner>`, `mentionUserIds` [owner]) and records the ping key; two more ticks post nothing. Clarify mentions only the schedule creator. Spend-cap pings the owner with the pending 80% warning and no reply hint; a second one in the episode and one in an episode already pinged elsewhere post without a ping. The same question pings once; of two pending asks only the newest posts. A later clean run, or deleting the schedule, leaves 0 posts. A refused channel: 0 posts, ask still pending. A post resolving `false`, then one throwing (`[scheduler] ask failed: gateway down` logged), then one succeeding: posted once on the third tick with the ping. A bridge-claimed run posts once and never again; two bridge tickers post a pending ask once. A channel-less schedule's ask is never delivered. All 13 tests fail on main's sources (bridge ticks make 0 posts; no ask columns) and pass on the branch. |
| `REQ-discord-347` (staleness, stop; review fix) | `tests/scheduler.ask-outbox.test.ts` | Two schedules, a bridge post held open: a later clean run of the second schedule while the pass posts the first makes the second's ask moot (not posted, `ask_posted_at` null). `stop()` mid-pass: the post in flight finishes, the other ask is not taken and posts after `start()`; `settleAskDelivery(20)` is false while the post is held. `startBridge` stop with a pending-ask post in flight: events are post start, post end, then `gateway.stop`, and the ask is marked posted. All three fail on the builder's first sources (the stale ask posts, the pass keeps claiming after stop, the gateway closes first). |
| `REQ-discord-347` (schema, SAFE-6) | `tests/scheduler.ask-outbox.test.ts` | `SCHEMA_VERSION` 11; a v10 DB (columns dropped) migrates to v11 keeping its run, which has no pending ask; a GitHub-token-shaped secret in the question is `[redacted:github-token]` at rest and absent from the post; `SCRUB_TARGETS` lists `ask_question` and `rescrubDatabase` re-scrubs a raw one. |
| `REQ-discord-108` | `tests/scheduler.ask-outbox.test.ts`, `tests/scheduler.claim.test.ts` | Two bridge tickers on one DB post a pending ask once (atomic `claimRunAsk`); the existing claim / column-ownership tests still pass. |
| `REQ-cli-098` | `tests/scheduler.ask-outbox.test.ts`, `tests/discord.spend.test.ts` | `startDaemon` on a temp data dir logs `run.needs_human` (`reason` `stuck`) and posts nothing; a `startBridge` on the same data dir (20 ms scheduler poll, null gateway) posts the ask to the owner once (0 replies on main). The existing daemon `spend.warning` / `run.needs_human` (`spend-cap`) test still passes. |
| `REQ-discord-044` / `REQ-discord-098` | `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts` | The bridge-claimed schedule ask suites (ping once per question, clarify → creator, no-owner warning, spend-cap episode, failed post hands back the warning and cap ping) pass unchanged after `postRunAsk` was extracted. |

Pinned schema assertions updated: `tests/scheduler.never-stuck.test.ts`
(`>= 10`), `tests/watch.session-store.durable.test.ts` (`11`).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
