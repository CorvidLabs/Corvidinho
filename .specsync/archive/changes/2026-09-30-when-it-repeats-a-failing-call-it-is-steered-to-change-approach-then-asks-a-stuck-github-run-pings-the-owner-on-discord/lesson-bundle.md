# Lesson bundle — when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a)
- **Kind**: Feature
- **Specs**: agent, watch, discord
- **Paths**: src/agent/loop-guards.ts, src/agent/execute.ts, src/watch/owner-ask.ts, src/watch/poller.ts, src/watch/agent-client.ts, src/watch/types.ts, src/discord/watch-ask.ts, src/discord/bridge.ts, src/store/scrub.ts, tests/agent.loop-guards.test.ts, tests/watch.stuck-ask.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, hi/agent.md, INTENT.md, docs/discord.md, docs/WATCH.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: AGENT-16 (captured, Leif's 2026-09-28 interview round 2) and AGENT-16.a (captured with hi in this PR from Leif's round 13 decision, 2026-09-30) hold: in every task run (chat, /session, /work, buttons, schedules, WATCH, delegate and council workers) the tool loop counts ok:false results per call signature (tool name + canonical argv; refusals and denials count), a real change (a result reporting filesChanged, or a successful real write tool, one explicit changedState predicate that classifies every dangerous or mutating builtin) resets every count and a call's own success resets its own; the 2nd identical failure gets a harness steer after its whole tool result quoting a scrubbed error excerpt; the next identical call once the model saw that steer in this conversation does not run and the attempt ends with the existing stuck HumanAsk naming only the offered tool (runTask blocked, owner pinged per AUTONOMY-2/4); an identical call in the same batch or in a fresh verify-retry conversation gets the steer again, never the ask; thresholds are constants; a WATCH run that ends with a stuck ask, on any event type, is recorded for the bridge in the shared DB (one per thread, SAFE-6 scrubbed, replaced by a newer one, dropped by a later run that is not stuck) and the bridge DMs the owner on its scheduler tick with the thread link and the stuck-ask post; with no live bridge on the data dir, or no owner Discord id, one watch log line says the Discord ping could not be sent and the run summary comment still carries the question where WATCH posts one; tests/agent.loop-guards.test.ts and tests/watch.stuck-ask.test.ts fail on the base sources and pass on the branch

## Evidence

- Verification commit: `792e2ee0836d666f04081ce961e5839f51007437`
- Base commit: `9abc768f5b1a2122ae55025efea32b4a9113e249`
- Verified by: `specsync check --spec agent --spec discord --spec watch`

## From the change's context.md

# Context

Issue #86 (M3 "Real dev teammate"), slice loop-guards-a of the M3/M4 plan.
Leif confirmed AGENT-16 as written in the 2026-09-28 interview (round 2:
"repeat-failure → change approach or ask"); it was already captured in
`hi/agent.md`. In round 13 (2026-09-30) he decided that WATCH stuck asks
"ping the owner on Discord like other stuck asks (needs the bridge running)";
this PR captures that as AGENT-16.a with `hi` (its own commit) and builds
both.

What was wrong on main (5093b81):

- `runToolLoop` (src/agent/execute.ts) sent every failure back as a plain
  tool message and kept no record of which calls failed. A model repeating
  the same failing call burned rounds until the tool-round budget ran out
  (AGENT-9 soft-land: prose or a clarifying line, never a HumanAsk), so it
  neither changed approach nor asked.
- On WATCH a stuck ask reached only the run-summary comment (ackable events
  after a successful ack, no owner mention); assignments and review requests
  posted nothing. The WATCH spawn client dropped the result frame's `ask`.

Constraints: specs only through SpecSync; thresholds are constants (no env
var, config key, flag, slash command or schema version bump); the existing
`stuck` HumanAsk reason and each surface's stuck path are reused; v1 is
off-chain; the forget card (src/discord/forget-card.ts) and approval code are
untouched (other PRs); #232/#233 scope untouched. Out, because not captured
(PROCESS-1): the '3 in 20 calls' window, did-you-mean for unknown tools, the
prefer-plugin steer, and AGENT-17 (next slices). Conservative defaults come
from /home/user/coord/m34-defaults.md (slice loop-guards) and are listed in
the PR under "Design choices pending Leif".

## From the change's design.md

# Design

- **Pure module** `src/agent/loop-guards.ts`: `callSignature` (JSON of the
  name and `argvFromToolArguments`), `changedState` (the one "something
  changed" predicate: `filesChanged` reported ok or not, or a successful
  `STATE_CHANGING_TOOLS` / Fledge plugin command; `NO_STATE_CHANGE_TOOLS`
  lists the dangerous or mutating builtins that are not changes, so a test
  can require every such builtin to be classified), the steer / ask text and
  `createRepeatFailureGuard`. Not `isMutatingPlugin`: it also flags
  `web-fetch`, `danger-ping`, `fledge-lanes-run` and `council`.
- **Guard state.** Failure counts live in the `createTaskExecute` closure
  (like `roleRefused` / `injection`), so they last across verify-retry
  attempts. Which signatures were steered, and in which round, is per
  conversation (`newConversation()` at each `runToolLoop`). `before(sig,
  round)` says "ask" only when the call has `STEER_AFTER_FAILURES`+ failures
  and its steer went out in an earlier round of this conversation; so an
  identical call in the same batch, or the first identical call of a fresh
  verify-retry conversation, runs and gets the steer again. A change clears
  everything; a call's own success clears its own count.
- **Dispatch wiring** (execute.ts): after the `ask-human` interception,
  `before` → "ask" returns `askExecuteResult(repeatedFailureAsk(eventName))`
  with one `ToolResult` and one operator Text line (scrubbed excerpt). After
  each result, `after` counts it; on `steer` the harness text is appended to
  the finished tool message, after any fence or SAFE-13 note. The ask names
  `eventName` (offered name or `(unknown tool)`), never error text.
- **Surfaces.** Every surface already runs `task run` and handles a
  `stuck` ask: Discord pings the owner with the Answer button, schedules
  block later ticks, `/work` opens no PR, the CLI prints it, a worker's
  blocked result is `ok:false` to its lead (whose guard counts it).
- **WATCH → Discord (AGENT-16.a).** The watch process and the bridge are
  separate processes sharing one data dir (as for GitHub forget asks). The
  WATCH spawn client now returns `ask`. After each finished run the poller
  calls `noteWatchRunAsk`: a stuck ask with an owner Discord id and a DB is
  upserted into `watch_owner_asks` (one per thread, scrubbed, SCRUB_TARGETS),
  anything else drops the thread's row. The log line says "queued" when a
  live bridge marked itself (`markBridgeRunning`: `<pid>:<proc start>` in
  `schema_meta`, checked with `isScheduleRunnerAlive`), else that the
  Discord ping could not be sent (no bridge; no owner id; no DB). The bridge's
  scheduler `onTick` runs `createWatchAskDelivery().deliver()` next to the
  forget cards: compare-and-delete claim, owner DM with
  `formatWatchStuckAskDm` (the `formatAskReply` stuck post, no mention, led
  by the thread link), hand-back plus a 10-minute wait on failure, give-up
  after a day, stop/settle hand-back on shutdown (the backup-notice pattern).
  DM, not a channel: a WATCH run has no Discord channel, and the question may
  come from a private repo.
- **Alternatives rejected.** A schema v14 table (other PRs bump the schema;
  module-owned tables are the precedent), `schema_meta` rows for asks (no
  structure, not scrub-targetable), posting to the `/announce` channel
  (public; AUTONOMY-10 round 13 makes channel posts ask first), and WATCH
  calling Discord REST itself (a second Discord client; Leif said it needs
  the bridge running).

## From the change's testing.md

# Testing

Mock LLMs only (a scripted `fetchImpl`, and a localhost `Bun.serve` for the
real CLI in a scratch non-git project), test plugins registered in-process,
in-memory SQLite, the WATCH poller with injected events, a stub agent and the
echo ack client, a fake `corvidinho` sh bin for the spawn client, and a
dry-run bridge whose gateway stub captures `sendDm`. No network, no real key
or token, and no test runs the repo's own verify lane.

Fail-on-base proof: with the base's (5093b81) six modified source files
swapped in (`src/agent/execute.ts`, `src/watch/{poller,agent-client,types}.ts`,
`src/discord/bridge.ts`, `src/store/scrub.ts`; the three new modules kept
so imports resolve), `bun test tests/agent.loop-guards.test.ts
tests/watch.stuck-ask.test.ts` gave 16 pass, 17 fail; restored, 33 pass,
0 fail. The 16 that pass on the base are the pure units of the new modules
(`callSignature`, `changedState` and its classification test, the guard,
the steer / ask text, the no-DB note, the bridge mark, the DM text and three
delivery units) and the "changes approach" guard (a different call after the
steer runs and the reply stands); every tool-loop, runTask, CLI, poller,
spawn-client, scrub-target and bridge-wiring case fails on the base (no
steer, no ask, nothing recorded, no DM).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("callSignature", "changedState") | argv spellings of one call match, other args / tools differ; every registered dangerous or mutating builtin is in exactly one set; a successful write / git commit / issue comment is a change, a failed write, reads, `web-fetch`, `council`, `danger-ping`, `fledge-lanes-run` are not; a failed `delegate` reporting `filesChanged` is; a Fledge plugin command's success is. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("createRepeatFailureGuard") | 2nd identical failure steers; same round runs; next round asks; another call in between changes nothing; a change resets every count; own success resets its own; a new conversation keeps counts but steers once more before asking; the steer quotes a scrubbed, 200-char excerpt; the ask names only the label. |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("tool loop …") | A tool that always fails, called three rounds: runs twice, the 2nd tool message ends with the steer after the whole result (no raw token after the mark), the 3rd never runs; `ask` = `repeatedFailureAsk("flaky-read")`, summary `Needs your input: …` without the error, a `ToolResult` with `REPEAT_FAILURE_BLOCK_DETAIL`, an `[operator] AGENT-16` line with `[redacted:github-token]`. Three in one batch all run (2nd and 3rd steered), the next round asks. A different call after the steer runs and the reply stands. A change in between: four runs, second steer, then the ask; `filesChanged` kept. A non-offered tool: ask with `(unknown tool)`, no tool name or SAFE-1 text in the summary. A verify retry: attempt 2's first identical call runs and steers ("failed 3 times"), the next asks. A `council` stand-in failing twice with an injection hit: the worker's text stays inside the fence and the steer says `STEER_FENCED_ERROR_NOTE`, quoting none of it (SAFE-12). Fail on base (no steer, no ask). |
| `REQ-agent-086` | `tests/agent.loop-guards.test.ts` ("runTask", "task run CLI") | runTask ends `blocked` with the stuck ask, verified false, the verify runner never called. The real CLI `task run --output ndjson` against a localhost mock repeating a missing `files-read`: exit 0, `blocked` result frame, `ask` = `repeatedFailureAsk("files-read")`, exactly three LLM requests. Fail on base (the loop runs out its rounds). |
| `REQ-watch-086` | `tests/watch.stuck-ask.test.ts` ("WATCH: …") | An assignment ending stuck: no GitHub post, one `watch_owner_asks` row (thread id, repo, number, event id / type, link, ask), the exact "could not be sent — no Discord bridge is running …" log line. With a live bridge mark, an issue comment's stuck ask is queued (log) and the summary comment carries `Needs your input: …`. A review request's verify-exhausted stuck ask gets the thread URL. A later run with no ask drops it; a clarify ask never queues; a spawn that throws leaves it. No owner Discord id: nothing stored, IDENTITY-3 log line. No DB: one log line, no throw. `bridgeRunning` true only for a live marked process; `clearBridgeRunning` clears only its own mark. The stored question is scrubbed, `watch_owner_asks.question` is in `SCRUB_TARGETS` and re-scrubbed; a clarify ask is never stored. Fail on base (nothing recorded). |
| `REQ-watch-086` | `tests/watch.stuck-ask.test.ts` ("the WATCH spawn client …") | A fake bin printing a `blocked` result frame: `runChat` returns `ask` = the stuck ask. Fail on base (no `ask`). |
| `REQ-discord-086` | `tests/watch.stuck-ask.test.ts` ("Discord bridge: …") | `formatWatchStuckAskDm` is the GitHub line, the stuck headline and the quoted question, no `<@`. Delivery: a failed DM hands the ask back and waits `WATCH_ASK_RETRY_MS`; then the owner's id gets the DM, the ask is taken, `owner DMed` logged, a later pass sends nothing. No owner / no `sendDm`: stays pending; past a day given up (`expired`), never sent. A stop while the DM hangs: `settle` false and the ask is pending again. A dry-run bridge with a `sendDm` stub marks itself, DMs the owner once for an assignment ask within a few ticks, takes it, and clears its mark on stop. Fail on base (no mark, no DM). |

## Automated coverage

- `tests/agent.loop-guards.test.ts` (18 tests) and
  `tests/watch.stuck-ask.test.ts` (15 tests).
- Unchanged suites that cover the touched files still pass:
  `tests/agent.tool-loop.test.ts`, `tests/safe.injection.test.ts`,
  `tests/agent.ask.test.ts`, `tests/agent.ndjson-spawn.test.ts`, every
  `tests/watch.*.test.ts`, `tests/ops.backup-wiring.test.ts`,
  `tests/discord.forget-card.test.ts`, `tests/store.scrub.test.ts`,
  `tests/scheduler.ask-outbox.test.ts`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/watch/context.md`
- `specs/discord/context.md`
