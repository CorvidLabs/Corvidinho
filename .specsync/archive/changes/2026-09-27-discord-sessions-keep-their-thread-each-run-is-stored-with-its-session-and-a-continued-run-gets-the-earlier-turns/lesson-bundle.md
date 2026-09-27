# Lesson bundle — discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord sessions keep their thread: each run is stored with its session and a continued run gets the earlier turns replayed, bounded (AGENT-6)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/session-thread.ts, src/discord/session-store.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/store/scrub.ts, tests/discord.session-thread.test.ts, tests/discord.session-thread.unit.test.ts, docs/discord.md, STATUS.md
- **Acceptance**: A reply, thread message, same-channel @mention or button pick that continues a live Discord session runs the agent with that session's earlier turns (the human's own words and the answer as posted, from @mention, reply, button pick, /session start and /work) replayed oldest first in a labelled block ahead of the new message, within a fixed character budget that keeps the opening request and the newest turns and replaces middle turns with an omitted-count marker; the thread survives a bridge restart within the soft TTL; a session idle past the TTL or ended starts fresh with no replay and its turns are deleted; another user's session never sees them; humanText (SAFE-4 confirm tokens) stays the current message only; a spend-cap stop records no cap text; stored turns are scrubbed on write and covered by the SAFE-6 re-scrub; no schema version bump, env var, flag or slash command; tests/discord.session-thread.test.ts and tests/discord.session-thread.unit.test.ts cover these and the new-behaviour tests fail on origin/main

## Evidence

- Verification commit: `ae002c61bc2cdcb18d6fccc27444982aa945f604`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

AGENT-6 was the one captured AGENT id with no REQ and no code (STATUS.md:
"no turn persistence/replay (AGENT-6; durable sessions only live within the
soft TTL)"; discord.spec.md changelog: "turn persistence/replay and summaries
stay follow-ups"). Issue #72.

Gap on origin/main fc0ed8d: a continued Discord session keeps its session id
and passes `resume: true`, but the spawn client ignores `resume` and runs
`task run --task <prompt>` with only the newest message; `execute.ts` builds
`[system, user(task)]` only; there is no turn table. So every turn lost the
thread, even inside the TTL. A button pick sent only the question and the
label, dropping the original request. Repro (now
`tests/discord.session-thread.test.ts`): @mention "the codeword is PELICAN,
keep it for this task", then reply "what was the codeword?" — run #2 has the
same session id and `resume: true`, but its prompt is memory + identity +
"what was the codeword?", with no PELICAN and no first answer. On main 9 of
the 12 bridge tests fail (the 3 SESSION-3 / SESSION-MULTI-1 / SAFE-4 guards
pass) and the unit file cannot load (no `session-thread.ts`).

Constraints: HI-first; no invented criteria (the #72 condensation is draft
SESSION-5/6); no new slash command, env var, flag or config key; do not bump
the SQLite schema version (a module-owned table, like `spend_ledger`);
SAFE-6 scrub; SAFE-4 confirm tokens only from the current message; SAFE-8 /
REQ-discord-098 no cap text into a later prompt (the existing
`tests/discord.spend.test.ts` and `tests/discord.slash-pending-ask.test.ts`
guards caught the first cut, which replayed the cap answer).

Design choices pending Leif: "later" is bounded by the soft TTL (SESSION-2/3;
MEMORY carries anything longer, SESSION-4); the budget is a fixed constant,
not a knob.

## From the change's design.md

# Design

- `src/discord/session-thread.ts` (new, pure + table DDL):
  `SessionTurn { role: "human" | "agent"; content; createdAt }`;
  `SESSION_THREAD_BUDGET_CHARS` 6000, `SESSION_THREAD_TURN_MAX_CHARS` 1500,
  `SESSION_THREAD_MAX_TURNS` 200, `SESSION_THREAD_HEADER` /
  `SESSION_THREAD_FOOTER`, `formatSessionThreadOmitted`, `clipTurnText`.
  `formatSessionThread(turns)` returns "" or the whole block when it fits;
  otherwise the opening turn, one omitted-count marker, and the newest turns
  that fit (walking back from the newest). With the default budget and clip
  the newest turn always fits. `withSessionThread(prompt, turns)` prepends
  the block. `answerTurnText(body, ask)`: "" for a spend-cap stop, question +
  choices for a button ask, else the body. `ensureSessionTurns(db)` creates
  `discord_session_turns (id INTEGER PK AUTOINCREMENT, session_id → 
  discord_sessions ON DELETE CASCADE, role, content, created_at)` + index.
- `SessionStore`: `turns: Map<sessionId, SessionTurn[]>`. Constructor with a
  DB calls `ensureSessionTurns` then `loadFromDb`, which (after dropping
  expired sessions) deletes orphan turn rows and loads the rest for live
  sessions. `recordTurn(session, role, text)` is a no-op unless the
  session is still the live one; the turn is `scrubSecrets`'d then clipped
  (scrub first, so a cut never leaves half a token), an empty turn skipped,
  capped at MAX (drop index 1), then written in one transaction (insert +
  the same cap as a DELETE); a DB error is logged as one scrubbed line,
  memory keeps the turn.
  `threadFor(session)` returns a copy. `removeLocal` / `deleteFromDb` drop
  turns with the session (end, TTL purge, load-time expiry).
- `bridge.ts`: chat path — after the pending-ask wrapper,
  `agentPrompt = withSessionThread(agentPrompt, store.threadFor(session))`
  (identity/memory/images are added after, as before), then
  `store.recordTurn(session, "human", prompt)` before the run, so a run
  that throws or a bridge that dies mid-run keeps the request; after the
  posted `body` is known, `store.recordTurn(session, "agent",
  answerTurnText(body, pendingToStore ?? askRaw))`, or the `❌ …` failure
  line when the run throws. Button pick — the same block ahead of the
  answered-question wrapper; record the label, then the answer.
  `humanText` unchanged (raw message / label).
- `/session start` and `/work`: record the topic/description before the
  run, then the summary (or the posted failure body when the run throws);
  their ask is text, so `answerTurnText` gets reason + question only.
- The header starts with `[Corvidinho ` and the block holds no blank line
  (blank lines inside a turn collapse), so `planningSelectionText`
  (REQ-agent-004) drops it whole: the header's "Discord" and earlier turns
  never pick a Planning module. `clipTurnText` never cuts a surrogate pair.
- `src/store/scrub.ts`: `SCRUB_TARGETS` adds
  `{ table: "discord_session_turns", columns: ["content"] }`.
- Not changed: `SCHEMA_VERSION` (10), `agent-client.ts` / `execute.ts`
  (the block rides in `--task`), WATCH, CLI, router, TTL.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-072` | `tests/discord.session-thread.test.ts` | Through `startBridge` with a fake gateway and a recording agent: "a reply that continues a session carries the earlier request and answer" (same session, `resume: true`, request + answer before the new message, `humanText` the new message only); "an @mention that continues the user's live session carries its thread too"; "every turn stays in the thread, oldest first, across several replies"; "the thread survives a bridge restart within the soft TTL" (file DB, second bridge); "a reply to a /session start answer carries its topic and answer" and the `/work` twin; "a button-pick resume carries the original request, not just the question and label" (and the next reply carries request, question, label, answer); "a spend-cap stop keeps the request in the thread but never its cap text"; "the replayed block never picks a Planning module the new message does not name (REQ-agent-004)"; "the request is stored as the run starts, so a bridge that dies mid-run keeps it"; "a chat run that throws keeps its request, so the next message continues the thread" and the `/session start` / `/work` twins; "replayed turns are scrubbed of secrets, in the prompt and at rest". On origin/main fc0ed8d sources all 14 fail; on the branch all pass. |
| `REQ-discord-072` | `tests/discord.session-thread.unit.test.ts` | Renderer: no turns → no block; short thread whole and labelled; long thread ≤ budget with the opening request, one exact-count marker and the newest turns; one huge turn clipped; Planning selection skips the whole block (multi-paragraph turns collapse to one paragraph) while a module the new message names still counts; a clip never ends on half a surrogate pair; `answerTurnText` (button ask → question + choices, spend-cap → nothing). Store: table created on open without a `schema_meta.version` change (idempotent); turns reload after reopen per session; end and TTL expiry delete turns (memory + DB) and a late record on an ended session is a no-op; expired and orphan rows swept on reload; cap keeps the opening request and newest turns (memory = DB = reload); scrub on write, `SCRUB_TARGETS` entry, `rescrubDatabase` rewrites a raw row. Cannot load on origin/main (no `session-thread.ts`). |
| `REQ-discord-072` (guards: SESSION-3, SESSION-MULTI-1, SAFE-4) | `tests/discord.session-thread.test.ts` | "a session idle past the soft TTL starts fresh with no replayed turns"; "another user's session never sees my turns, and mine never sees theirs"; "confirm tokens come only from the current message, never from replayed turns". Pass on origin/main and on the branch. |
| `REQ-discord-098` | `tests/discord.spend.test.ts`, `tests/discord.slash-pending-ask.test.ts` | Unchanged "a substantive reply carries no cap text" tests still pass (they failed on a first cut that replayed the cap answer; now a spend-cap stop records no answer turn). |
| `REQ-discord-002`, `REQ-discord-019`, `REQ-discord-046` | `tests/discord.slash-reply-continuity.test.ts`, `tests/discord.session-store.durable.test.ts`, `tests/discord.router.test.ts` | Unchanged; still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.

## Where these lessons go

- `specs/discord/context.md`
