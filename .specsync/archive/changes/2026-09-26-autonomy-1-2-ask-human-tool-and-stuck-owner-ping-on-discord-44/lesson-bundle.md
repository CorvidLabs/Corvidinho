# Lesson bundle — autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44)
- **Kind**: Feature
- **Specs**: agent, discord
- **Paths**: src/agent, src/discord, src/scheduler, tests, docs/discord.md, src/store/db.ts, src/work/pr.ts
- **Acceptance**: Tool loop offers an ask-human tool; calling it ends the run with state blocked and TaskResult.ask {reason clarify, question} instead of claiming done (AUTONOMY-1); verify retries exhausted keep state failed and add ask {reason stuck} (AGENT-4 + AUTONOMY-2); CLI text/json/ndjson surface the question; Discord mention replies and schedule posts show the question and mention the configured owner with allowedMentions limited to that owner, skipping the ping when no owner is configured (AUTONOMY-2 / IDENTITY-3); fixture tests only; specsync + fledge verify green

## Evidence

- Verification commit: `beed94fa09135d9d3411a2eaca7e5256994646cb`
- Base commit: `8205b1bb66eb18aa63328e4690de3dba0f8b6ecc`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #44 (M4 Safe autonomy): when Corvidinho is blocked on missing intent or
a human decision it should ask and ping the owner on Discord instead of
inventing an answer or going quiet. Leif confirmed and captured
**AUTONOMY-1..3** in `hi/autonomy.md`; his planning-interview comment on #44
confirms "when stuck, it asks a clarifying question **and** pings".

Before this change the tool loop had no way to stop and ask: a model that was
unsure either guessed or ended with a plain summary that runTask reported as
`done`. A run that exhausted verify retries replied on Discord with only
`session ... failed (exit 1)` and nobody was pinged.

Constraints: build only the captured slice. The owner is the ping target
because AUTONOMY-2 says "configured owner" and IDENTITY-1 already provides the
record. Not built (left for HI capture / other issues): a DM path to the owner
(#42 / Approve-Deny cards #96 are not captured; DISCORD-5 keeps posts in
allowlisted channels), escalation delay ("Leif too if it's still stuck"),
recording questions in MEMORY so answers resume with the question in context
(draft AUTONOMY-3 in docs/hi-drafts, not the captured AUTONOMY-3), loop-guard
(#86) and CI-fix retry limit (#94) asks, and pings from `/work` /
`/session start`.

## From the change's design.md

# Design

Agent side (`src/agent/ask.ts`, new):

- `ask-human` is an agent-level tool, not a plugin. `withAskTool` appends its
  OpenAI tool definition (`{question: string}`) to the plugin catalog on
  tool/code tiers (read tier still sends no tools) and drops any plugin that
  shares the name.
- The tool loop intercepts the call: a non-empty question ends the execute
  attempt with `ExecuteResult.ask = {reason: "clarify", question}` and summary
  `Needs your input: <question>`; an empty question is refused back to the
  model as a failed tool result and the loop continues.
- `runTask`: an execute result with `ask` emits `StateChanged blocked` and
  returns state `blocked` (verify not run, `verifySkipped: true`). Verify
  exhaustion keeps state `failed` (AGENT-4) and adds `ask = {reason: "stuck"}`
  with the question appended to the summary.
- `AgentState` gains `blocked` (NDJSON parser + status label "needs input").
  `TaskResult.ask` rides the existing `result` frame. Additive: protocol
  stays 2; an older bridge drops the unknown state frame and shows the
  summary, which carries the question.
- CLI needs no change: text prints the summary, `--json` / ndjson carry
  `result.ask`; blocked exits 0 (failed still exits 1).

Discord side (`src/discord/ask-ping.ts`, new):

- `formatAskReply` builds the post: headline + owner mention on the first
  line (a length cut never drops the ping), the question quoted, stuck
  context (<=400 chars), optional reply hint. Model text is SAFE-6 scrubbed and
  `@everyone` / `@here` are defanged. `mentionUserIds` is `[owner]` or `[]`.
- Spawn client validates `result.ask` with `askFromUnknown`.
- Bridge mention path: an ask replaces the summary / `failed (exit N)` body,
  the thinking embed ends "Needs your input" (or failed "Stuck"), and the
  reply passes `mentionUserIds`; the live gateway turns that into
  `allowedMentions {parse: [], users, repliedUser: true}`. No owner means no
  mention and a logged warning (IDENTITY-3).
- Scheduler: `SchedulerService` takes `owner`; a tick with an ask posts the
  question with the schedule line as prefix and the owner mention.
- Ping dedupe: `askPingKey` (hex SHA-256 of reason + SAFE-6 scrubbed
  question) is stored in `schedules.ask_ping_key` (schema v7, column-only
  write via `ScheduleStore.setAskPingKey`) after a pinged post. A repeat with
  the same key posts the question with no mention and no warning. A clean run
  (ok, no ask) and `setStatus` (pause/resume) clear it; a failed run keeps it.
  Persisting it in SQLite keeps the dedupe across bridge restarts and a
  bridge + daemon sharing one data dir.
- `/work` (merged from #166): `openWorkPr` stops with `needs-input` when the
  run's result frame says `blocked`, before any repository, plugin or verify
  call — a run that asked a human is not done, so it is not shipped.

Alternatives rejected: a DM to the owner (not captured; DISCORD-5), a new
slash command (not captured), a protocol bump (the change is additive).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-044 | `tests/agent.ask.test.ts`: argument parsing / refusal / cap; catalog dedup; mock-HTTP tool loop ends on ask-human without running a plugin; empty ask refused and loop continues; read tier sends no tools; runTask blocked (no verify, never done) and verify exhaustion failed + stuck ask; NDJSON blocked state + result ask round-trip; CLI `task run --json` / text against a localhost mock LLM (state blocked, exit 0, question printed) |
| REQ-discord-044 | `tests/discord.ask-ping.test.ts`: formatAskReply (owner on first line, no owner means no mention, stuck context, scrub + defang + length cap); bridge mention path with clarify / stuck / no-owner / ordinary runs (fake gateway, temp project root); spawn client reads and validates `result.ask` from a fake sh bin; scheduler tick posts question + owner mention; schedule ping dedupe (same question pings once and repeats post unpinged and unwarned, changed question/reason pings again, failed run keeps the marker, clean run and pause/resume re-arm, SQLite marker survives a restart / second ticker, no owner records no marker, digest shape, schema v7 migration from v6); blocked `/work` run opens no PR (`needs-input`, no repository/plugin/verify calls); `tests/watch.session-store.durable.test.ts` schema version assertions follow v7 |

## Automated coverage

- `bun test tests/agent.ask.test.ts tests/discord.ask-ping.test.ts`
- `bun test` (full suite), `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
