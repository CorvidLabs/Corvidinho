# Lesson bundle — a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A failed run tells the owner why in one plain line, and everyone else that it didn't work and the owner has been told (DISCORD-3.b)
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: src/discord/failure-reason.ts, src/discord/bridge.ts, src/discord/agent-client.ts, src/discord/types.ts, src/discord/slash-types.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/scheduler/service.ts, src/agent/types.ts, src/agent/providers.ts, src/agent/execute.ts, src/agent/loop.ts, src/agent/events-ndjson.ts, tests/discord.failed-reply.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.inflight-replies.test.ts, tests/scheduler.ask-outbox.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, hi/discord.md, INTENT.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md
- **Acceptance**: DISCORD-3.b (captured with hi in this PR from Leif's 2026-09-28 interview, round 15 on 2026-09-30) holds on every surface that posts a failed run (chat, an ask pick or Answer form resuming a talk, /session start, /work, a schedule's result post): the owner's own run (the DISCORD-15.a owner check; a schedule the owner created) gets one plain line saying why; anyone else gets 'That didn't work — the owner has been told.' only once the owner has been DMed the reason with the surface and channel (one DM per reason per hour), else 'That didn't work.'; every failure logs '[discord] run failed (<surface>, exit N): <reason>' ('[scheduler] …' for schedules); the reason is harness text only (the task run result's new optional error: the no-provider notice, which model call failed as status and host never the provider body, which verify failed; else the tier's AGENT-10 notice; else the last meaningful stderr line; else the exit code), SAFE-6 scrubbed before it is cut to one line of at most 200 characters with stack frames and host paths stripped, no spend amounts (SAFE-14.a), and the state/verified/attempts plumbing stays in the embed footer (DISCORD-3.a); tests/discord.failed-reply.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `a6bd22a79f0fdc9738ad2536e5a8f255b8062c19`
- Base commit: `c5a37b32f21ba40f6a7d6b3c50f10900afe7c713`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #122 (M2 "Talk anywhere"). Leif's live failure on Discord: "show me a
gif of a dog" → `session sess_be8e982b6df84eb4 failed (exit 1)` with the
footer `gpt-4o-mini | tokens unknown | cost unknown | 1s | state=failed
verified=false attempts=1` and no reason anywhere. In round 15 of his
interview (2026-09-30, record `/home/user/coord/interview-2026-09-28.md`) he
chose: the owner sees one short plain scrubbed reason; others get "That didn't
work — the owner has been told."; the reason is always logged at the bridge.
This PR captures that as DISCORD-3.b with `hi` (its own commit) and builds it.

What was wrong on main (9ea4005):

- `src/discord/bridge.ts` (chat and the ask-pick / Answer resume),
  `src/discord/command-handlers/session.ts`, `work.ts` and
  `src/scheduler/service.ts` posted `session <id> failed (exit N)` /
  `failed (exit N)` and dropped the reason; a run that threw posted its raw
  error message (host paths included) to everyone.
- `task run` in the machine modes keeps stderr quiet and the failed
  result's summary is the provider's error text (`LLM HTTP 401: <body>`),
  which is provider output, not harness text; `collectTaskRunStream` read
  the child's stderr but nobody logged or showed it.

Constraints: specs only through SpecSync; no protocol bump (the result frame
gains an optional `error`); no env var, config key, slash command or schema
change; v1 is off-chain; #232/#233 and the parallel stop-button-2,
cli-worktree and spend-caps-c slices are untouched (the bridge edits are the
failure-body lines, the throw lines and the helper wiring only).

## From the change's design.md

# Design

- **One helper**, `src/discord/failure-reason.ts`:
  `failureReasonFor(run, env)` picks the result frame's `error`, else the
  run tier's `providerNotice` (AGENT-10), else the last meaningful stderr
  line, else the exit code (130 = interrupted); never the summary.
  `plainFailureLine` scrubs first (SAFE-6), drops ANSI codes, stack frames,
  Bun source excerpts, caret lines and runtime banners, keeps the last line
  that reads like an error (else the last one), cuts host paths to
  `…/<last segment>` (URL hosts untouched), collapses whitespace, defangs mass
  mentions and cuts to 200 at a sentence end (≥ 40 chars), else a word end,
  else hard, with `…`.
- **Owner DM**: `createFailureOwnerDm({ owner, sendDm })` → `tell()` DMs
  `❌ A run failed (<surface> in <#channel>): <reason>`; a reason told within
  the hour is not re-sent (true); a DM that failed is forgotten (false).
  One instance in the bridge, shared by chat, the slash context and the
  bridge's scheduler; the daemon wires none.
- **Reply**: `failedRunOutcome` logs `[discord] run failed (<surface>, exit
  N): <reason>` (`[scheduler]` for schedules), then returns the reason for
  the owner's run, else `FAILED_TOLD_OWNER_TEXT` when `tell` is true, else
  `FAILED_TEXT`. Surfaces call it only where they used to post the failed
  line (no ask, not stopped), so asks, stops and spend-cap stops are
  unchanged; the thrown-run paths use it with the thrown message.
- **Schedules**: the owner rule is `byOwner` (the live owner's own
  schedule); the row keeps `summary` = the posted line and `error` =
  `failed (exit N): <reason>` (scrubbed at rest, logged by the daemon's
  `run.finished`); a failed run with its own ask keeps the old row line.
- **Agent side**: `callModels` adds `reason =
  modelCallFailedLine(failure, provider)` to a failed `Completion`; the
  three `error: true` returns carry it (or the no-provider notice) as
  `failureReason`; `runTask` copies it to `TaskResult.error`, and sets
  `verifyGaveUpReason` / `VERIFY_RERUN_FAILED_REASON` on verify failures.
  `collectTaskRunStream` keeps the stderr end; the spawn client hands
  `failureReason` (validated, scrubbed, capped) and, on a failure,
  `stderrTail` to the bridge.

## From the change's testing.md

# Testing

Stub agents, a dry-run bridge whose gateway stub records replies and
`sendDm`, in-memory SQLite, a `SchedulerService` with a recording poster,
fake `corvidinho` sh bins for the spawn client, and the real CLI against a
localhost provider that answers 401. No network, no real key or token, and no
test runs the repo's own verify lane.

Fail-on-base proof: with the base's (9ea4005) twelve modified source files
swapped in (`src/agent/{events-ndjson,execute,loop,providers,types}.ts`,
`src/discord/{agent-client,bridge,slash-types,types}.ts`,
`src/discord/command-handlers/{session,work}.ts`,
`src/scheduler/service.ts`; the new `src/discord/failure-reason.ts` kept so
imports resolve), `bun test tests/discord.failed-reply.test.ts` gave 7 pass,
15 fail; restored, 22 pass, 0 fail. The 7 that pass on the base are the pure
units of the new module (reason order, scrub and cut, the owner DM dedup, the
reply body); every `modelCallFailedLine`, `task run`, spawn-client, chat,
ask-pick, `/session start`, `/work` and schedule case fails on the base
(the old `failed (exit N)` line, no `error`, no DM).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("failureReasonFor / plainFailureLine") | The frame's `error` wins; a key in stderr is `[redacted:openai-key]`, also across the cut; a stack / source excerpt / host path / banner stderr becomes `error: ENOENT: … posix_spawn '…/corvidinho'`; ≤ 200 chars, one line, `…` on a cut; URL hosts kept, `@everyone` defanged; no reason → the AGENT-10 notice, else the stderr end, else the exit code; never the summary. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("createFailureOwnerDm", "failedRunReply") | One DM per reason per hour; a failed or thrown DM is false and retried next time; no owner / no DM path false; owner → reason, others → told or `That didn't work.`; one `[discord] run failed (<surface>, exit N): …` log line each. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("chat", "an ask pick", "/session start and /work", "schedule result posts") | Owner body = the reason with `state=failed verified=false attempts=1` only in the footer; a team member's run → `That didn't work — the owner has been told.` and one owner DM `❌ A run failed (<surface> in <#chan-1>): …` per reason; failed DM / no owner → `That didn't work.`; no provider → the AGENT-10 notice; a thrown run → scrubbed `❌` line (owner) or the told line; schedules: owner's → reason (row error kept), others → told with DM or `That didn't work.` (daemon, failed DM), `[scheduler] run failed (schedule <id>, exit 1)` logged. Fail on base. |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("end to end …") | The bridge spawning the real `task run` against the 401 provider answers the owner `The model call failed (401 Unauthorized from 127.0.0.1:<port>)` and a team member the told line, DMing the owner; the provider body never appears. Fail on base. |
| `REQ-agent-032` | `tests/discord.failed-reply.test.ts` ("modelCallFailedLine", "task run: …") | Each failure kind's line; `verifyGaveUpReason` / `VERIFY_RERUN_FAILED_REASON`; the real CLI's `result` frame has `error` `The model call failed (401 Unauthorized from 127.0.0.1:<port>)` without the body, and the AGENT-10 notice with no model; the spawn client hands over `failureReason` and a crash's `stderrTail` (≤ 4000), neither on success. Fail on base. |
| `REQ-discord-079` | `tests/discord.failed-reply.test.ts` ("chat" > "no provider configured: the owner sees the AGENT-10 notice"); `tests/agent.providers.test.ts` (the start-up line) | With no usable model the owner's own failed chat run answers the no-provider notice as its one line, not `… failed (exit 1)`; the `[discord] <notice>` start-up line is unchanged. |
| `REQ-discord-353` | `tests/scheduler.ask-outbox.test.ts` ("auto-pause and pre-run failures ask the owner …") | The pause ask of someone else's schedule, daemon- or bridge-claimed, carries that run's DISCORD-3.b failed line (`That didn't work.`, no DM path in that harness) as context and the row keeps it as `summary`; never the run's output (`boom`). |
| `REQ-discord-032` | `tests/discord.failed-reply.test.ts` ("a secret in stderr is scrubbed …") | A URL's `user:pass@` in stderr or a result `error` is dropped with the host kept (`https://git.example.com/…`, `http://10.0.0.2:8080/v1`). |

## Automated coverage

- `tests/discord.failed-reply.test.ts` (22 tests).
- Updated for the new line: `tests/discord.thinking-bridge.test.ts`,
  `tests/discord.inflight-replies.test.ts`, `tests/scheduler.ask-outbox.test.ts`.
- Unchanged suites that cover the touched files still pass (`bun test`, all
  files).

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
