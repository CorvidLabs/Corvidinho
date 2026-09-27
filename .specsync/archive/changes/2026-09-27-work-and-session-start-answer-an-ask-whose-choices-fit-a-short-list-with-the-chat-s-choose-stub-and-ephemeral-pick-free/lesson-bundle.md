# Lesson bundle — work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: /work and /session start answer an ask whose choices fit a short list with the chat's Choose stub and ephemeral pick, free text only when the options cannot be listed (DISCORD-ASK-1/4)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/ask-buttons.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/discord/slash-finish.ts, src/discord/slash-types.ts, src/discord/spend-post.ts, src/discord/gateway.ts, tests/discord.slash-choose-ask.test.ts, tests/discord.slash-pending-ask.test.ts, docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md
- **Acceptance**: A /work or /session start run that stops with a clarify or stuck ask whose choices fit a short list (ask-human options, or a numbered list in the question) answers in one message with the chat's public Choose stub (no question, options or reply hint in it; one Choose button), keeps the ask with its options and stub message id as the session's pending ask, and the requester's Choose press opens the ephemeral options whose pick resumes that same session in the stub; the Choose button stays on the fallback reply and on the owner-notice re-edit; an ask whose options cannot be listed stays the free-text ask and a spend-cap stop is never a button ask or pending; tests/discord.slash-choose-ask.test.ts covers each and its bridge tests fail on the previous code

## Evidence

- Verification commit: `c200ba3da2af0684f31e52f09fb444d552a18791`
- Base commit: `1c7b6ced470e0ed87e4c854f2663111713af3fa7`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Captured HI (`hi/discord.md`):

- **DISCORD-ASK-1** "Clarify/stuck choices that fit a short list use Discord
  components (buttons), not a public \"reply to this MCQ\"."
- **DISCORD-ASK-4** "Free-text clarify only when options cannot be listed;
  prefer ephemeral over a public ping."

Gap on main (1c7b6ce): `src/discord/command-handlers/work.ts` and
`session.ts` store `toPendingAsk({ reason, question })` for a clarify or
stuck ask, dropping its options, and answer with `formatAskReply`: the
question (and any numbered choices in it) is posted publicly as text and
answered by reply, even when the ask-human tool listed options. Only the
@mention / reply chat path used the Choose stub. REQ-discord-044 and
`docs/discord.md` pinned the text-only slash ask; that came from
implementation PR #216, with no Leif decision on it, and contradicts the
captured DISCORD-ASK-1/4 text.

Constraints: reuse the chat Choose stub (`formatAskStub`,
`buildOpenStubComponents`) and the existing `onComponent` open / pick path
(no bridge change; open PR #232 owns the button actor gate and mute/rate for
presses). No new slash command, env var, config key or schema change: the
pending ask with options already persists in `discord_sessions.pending_ask`.
Schedules stay text (no resumable session behind a schedule post). A SAFE-8
spend-cap stop stays free text and is never pending.

## From the change's design.md

# Design

- `ask-buttons.ts`: `buttonAskFor({ ask, ownerDiscordId?,
  requesterDiscordId?, nowMs? })` returns `{ pending, stub, components }`
  (`ButtonAsk`) when `resolveAskOptions` lists two or more choices, else
  null; always null for a `spend-cap` ask. It composes the chat pieces
  (`toPendingAsk` with the options, `formatAskStub`,
  `buildOpenStubComponents`).
- `/work` and `/session start`: `choice = buttonAskFor({ ask,
  requesterDiscordId })` (no owner: on the slash path the owner is told by
  the separate notice post, so the stub of a stuck ask pings nobody, as the
  free-text slash answer did). The answer body uses `choice.stub` instead
  of `formatAskReply`; the pending ask is `choice.pending` (else the
  free-text ask as before); the thread records the question and choices
  (`answerTurnText`, as in chat).
- `slash-finish.ts`: `finishSlashWithThinking` takes optional
  `components` for the collapsed edit and the fallback reply, and
  `onDelivered(mode, messageId?)` now passes the answer message id (the
  collapsed message, or the id the fallback `editReply` resolved).
  `recordSlashStub(store, session, pending, messageId)` stores it as the
  pending ask's `stubMessageId` (only while that ask is still pending; a
  failed DB write is logged, the deferred reply still resolves).
- `spend-post.ts`: `finishSlashWithOwnerNotice` passes `messageId`
  through and keeps `components` when it appends the owner notice to the
  collapsed answer (re-edit) or the fallback reply.
- `slash-types.ts` / `gateway.ts`: `SlashReplyPayload.components`, and
  the live adapter forwards it to discord.js `reply` / `editReply`.
- Pick path: unchanged. `onComponent` finds the session by `askId`,
  checks the channel and the session's own user, opens the ephemeral options
  and on pick resumes the session with `existingMessageId = stubMessageId`.
- Rejected: a new env/config key to switch the behaviour (not needed: the
  captured text sets it); posting the stub as a separate message next to the
  slash answer (two messages, against DISCORD-ASK-6/7); Choose buttons on
  schedule posts (no resumable session); editing `bridge.ts` (owned by the
  open #232 for the press gate).

## From the change's testing.md

# Testing

Fixture tests only: `startBridge` with a null gateway, in-memory thinking
outbound, injected agents and fake slash / component interactions; no live
Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.slash-choose-ask.test.ts` | `/work` clarify ask with options: task `blocked`; the collapsed answer has the Choose hint and requester mention, no question / option / reply hint, components = one Choose button; deferred reply deleted; one `↑ question for you` ping; pending ask = the ask with options, `stubMessageId` = answer id; Choose press → ephemeral question + pick buttons; pick → second run, same session, `resume: true`, `humanText` `Postgres`, prior question in the prompt, pending cleared, answer edited into the stub. `/session start` with a numbered list: stub, parsed options `Postgres` / `SQLite`, pick resumes the same session. Thin reply to the stub restates it with the Choose button (agent not run); a substantive reply runs the same session and the button ask stays. Stuck `/work` with options: `failed`, stub pings nobody, the owner notice is the one post; with the notice post failing, the re-edited stub carries the notice and keeps the Choose button. No `editMessage`: the deferred reply carries the stub + button and its id `reply_1` is `stubMessageId` and maps to the session. No listable options: free text, no button, options undefined. All 6 bridge tests for listable options fail on the base sources (no Choose stub; options dropped) and pass on the branch; with only the `spend-post.ts` re-edit reverted the notice test fails. |
| `REQ-discord-044` | `tests/discord.slash-choose-ask.test.ts` (`recordSlashStub`, live gateway) | `recordSlashStub` stores the stub id on the still-pending ask in memory and in `discord_sessions.pending_ask`; after a pick cleared the ask it writes nothing; after `endSession` it does not bring the row back (fails without the live-session guard). The live gateway adapter (real `Client#login`, socket stubbed) passes the Choose button to discord.js on the deferred `editReply` and a plain `reply` (fails without the `components` forward in `gateway.ts`). |
| `REQ-discord-044` / `REQ-discord-045` | `tests/discord.slash-choose-ask.test.ts` (`buttonAskFor`) | Structured options → pending with those options, stub without the options, one Choose button; a numbered list is parsed; a free-form question and a `spend-cap` ask (even with options) → null. |
| `REQ-discord-044` | `tests/discord.slash-pending-ask.test.ts` | The free-text slash asks (no options; a single option) keep a free-text pending ask; thin reply restates, cancel clears, substantive reply resumes; stuck, spend-cap, other-user, finished-run and no-`editMessage` tests pass unchanged. |
| `REQ-discord-045` / `REQ-discord-215` / `REQ-discord-098` | `tests/discord.ask-ephemeral.test.ts`, `tests/discord.collapsed-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.slash-ask7.test.ts` | Chat Choose stub / pick, collapsed pings, spend-cap slash notices and ASK-7 slash collapse pass unchanged. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
