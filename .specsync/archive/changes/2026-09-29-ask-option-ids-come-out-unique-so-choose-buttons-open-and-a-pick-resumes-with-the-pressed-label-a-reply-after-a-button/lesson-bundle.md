# Lesson bundle — ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5)
- **Kind**: BugFix
- **Specs**: agent, discord
- **Paths**: src/agent/ask-options.ts, src/discord/bridge.ts, tests/discord.ask-buttons.test.ts, tests/discord.ask-ephemeral.test.ts, docs/discord.md
- **Acceptance**: normalizeAskOptions returns unique option ids: an explicit id, an id cut to 32 chars, or a position fallback that repeats an earlier option's id takes the first unused position number (1, 2, ...), and a dropped empty option holds no id; options whose ids are already unique (every stored ask, and every ask made before this change that had distinct ids) normalize byte-identically, so stored asks and open buttons keep working; an ask-human call whose options repeat one id opens a Choose ephemeral with distinct pick custom_ids, and pressing the second button resumes the requester's session with the second label; in onMessage a continue that is not a cancel, on a session whose pendingAsk is a button ask past its expiresAt, clears that ask with clearPendingAsk before the thin-ack gate, so a thin reply restates the newest open ask that has not expired or, with none, runs the agent (never a restated stub with a dead Choose button), a substantive reply runs the agent as before and leaves no expired pending ask, and cancel still clears every open ask with the short ack and no agent run; late presses on a gone ask (onComponent) are unchanged here; no new env var, config key, slash command, table, column or schema version

## Evidence

- Verification commit: `4813af3965c821e79a1ec59f74749b1f05ce93ce`
- Base commit: `0f2e2c2774635d1dcbdff599cba92dbecf8eebd9`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

W12 bug sweep, wave 0 of Leif's 2026-09-28 interview ("W12 bug sweep (2
confirmed seeds)"; no new criteria). Two surviving sweep records
(`ask-option-id-collision`, `expired-button-ask-restated`), both
reproduced on `origin/main`:

1. `normalizeAskOptions` (`src/agent/ask-options.ts`) never
   de-duplicated option ids. A repeated explicit id, two ids equal once cut
   to 32 chars, or a position fallback (`String(i + 1)`, used for a missing,
   empty or secret-looking id and for plain string options) equal to an
   earlier id gave two options the same id. The option buttons then share
   one `custom_id` (`cvask:pick:<askId>:<id>`), which Discord rejects, so
   the Choose press fails; and `findOptionLabel` returns the first match,
   so a press on the second button resumed with the first label.
2. `onMessage` (`src/discord/bridge.ts`) checked only `session.pendingAsk`
   in the thin-ack/cancel branch, never `isAskExpired`. The newest button
   ask, once timed out, stayed pending (expiry was only acted on by a press
   or when promoting after a clear), so every thin reply restated it with a
   requester ping and a fresh Choose button whose press only answers "that
   choice expired", and the agent did not run.

Constraints: HI DISCORD-ASK-1/3/5 and REQ-discord-044/045 and REQ-agent-045
already say what should happen; nothing is captured here. #232/#233 scope is
untouched. A separate PR (branch `claude/w12-ask5-late-press-expired`)
handles a late *press* on a gone ask in `onComponent`; this change does not
touch `onComponent` or `SessionStore`. No new env var, config key, slash
command, table, column or schema version; `specs/` only through SpecSync.

## From the change's design.md

# Design

- `src/agent/ask-options.ts`: `normalizeAskOptions` keeps a `Set` of the
  ids already given to kept options. Each kept option's id (explicit, cut to
  32 chars, or its position fallback) goes through `claimOptionId`: when
  the id is free it is kept as is; when taken, the first unused position
  number (`"1"`, `"2"`, …) is used. The id is claimed only after the label
  survives `toOption`, so a dropped empty option holds no id. An ask whose
  ids are already unique comes out byte-identical (same objects, same key
  order), so stored asks, the bridge's re-normalization of an agent ask
  (`resolveAskOptions` in `bridge.ts`) and open buttons are unchanged.
  With at most `ASK_OPTIONS_MAX` (5) options the loop ends within 6 tries.
- `src/discord/bridge.ts` `onMessage`: before the thin-ack/cancel branch,
  when the action is `continue_session`, the session's `pendingAsk` has
  options (a button ask), `isAskExpired(pendingAsk)` is true and the
  message is not a cancel, call `store.clearPendingAsk(session,
  pendingAsk.askId)`. That existing store call promotes the newest open ask
  that has not timed out (dropping timed-out earlier ones) or leaves none.
  The existing branch then restates a live ask for a thin reply, or the
  message runs the agent. A substantive reply runs the agent exactly as
  before (a button ask never added a prior-question block). A cancel skips
  the clear so it still gets `ASK_CANCELLED_ACK` and clears every open ask.
- Free-text asks are untouched (DISCORD-ASK-5 is about button prompts).
- Trade-off: after the clear, a press on the dropped ask is a press on a gone
  ask. On this base that answers "This choice isn't for you (or it was
  already answered)", the same reply main already gives for a timed-out
  earlier ask dropped by `clearPendingAsk`; the sibling late-press PR turns
  it into "that choice expired". The new tests do not assert that reply, so
  they hold with or without the sibling change.

## From the change's testing.md

# Testing

Regression tests (fixtures only, no live Discord or network):

- `tests/discord.ask-buttons.test.ts` › "ask option ids are unique
  (DISCORD-ASK-1/3 / REQ-agent-045)" — 6 unit cases on
  `normalizeAskOptions`, `askFromToolArguments`, `buildChoiceComponents`
  and `findOptionLabel`.
- `tests/discord.ask-ephemeral.test.ts` › "ask option ids and expired button
  asks (DISCORD-ASK-1/3/5)" — 5 cases through `startBridge` with a scripted
  agent and the null gateway (the existing harness).

Fail-on-base proof: with `src/agent/ask-options.ts` and
`src/discord/bridge.ts` swapped back to `origin/main` (`0f2e2c2`) and the
new tests kept, 8 of the 11 new tests fail (4 unit, 4 bridge); the 3 that
pass there are guards for behaviour this change keeps (a dropped empty
option holds no id; already-unique asks normalize byte-identically; cancel
after expiry keeps its ack). With the change: all 11 pass, and the 136 tests
of the ask suites (`tests/discord.ask-*.test.ts`, `tests/agent.ask.test.ts`,
`tests/discord.slash-*ask*.test.ts`, `tests/scheduler.ask-outbox.test.ts`)
pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a repeated explicit id takes the first unused position number" | `[{x,Keep},{x,Drop}]` → ids `x`, `1` (labels kept); `[{x},{x},{1}]` → `x`, `1`, `2`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a position fallback that equals an earlier id is moved on" | `[{2,A},{✅,B}]` → `2`, `1`; `["Yes",{1,No}]` → `1`, `2`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "ids that are equal once cut to 32 chars stay apart" | Two slugs sharing their first 32 chars → `option_use_postgres_for_the_main`, `1`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "a dropped empty option does not hold its id" | `[{a,"  "},{a,A},{b,B}]` → `a`, `b`. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "already-unique options normalize byte-identically, again and again" | Strings, explicit ids, mixed and a de-duplicated ask re-normalize to the same JSON; `[{1,Postgres},{2,SQLite}]` stays byte-identical. |
| `REQ-agent-045` | `tests/discord.ask-buttons.test.ts` › "ask-human args with one id twice give buttons with distinct custom ids" | `askFromToolArguments` with ids `x`, `x` → 2 distinct pick `custom_id`s; the second id finds `Drop`. |
| `REQ-discord-045` | `tests/discord.ask-ephemeral.test.ts` › "options with a repeated id open as distinct buttons and a pick resumes with the pressed label" | Stored ask has 2 distinct ids; the Choose press sends 2 distinct pick `custom_id`s; pressing the second resumes with `humanText` `Drop` and "Human answer:\nDrop". |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a thin reply after the button ask timed out runs the agent, not a restated Choose" | After `expiresAt` passes, `ok` runs the agent (2 calls, no "Which DB?]" block), no reply carries the ask's `cvask:open` button or the Choose hint, and no ask is pending. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a thin reply after the newest button ask timed out restates the newest one still live" | Newest ask B timed out, earlier A live: `ok` runs no agent and restates A's Choose button (not B's); A is `pendingAsk`, `openAsks` empty. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a substantive reply after the button ask timed out runs the agent and clears it" | A substantive reply runs the agent and leaves no pending ask; a later `ok` runs the agent too. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "cancel after the button ask timed out still gets the short ack and no agent run" | `cancel` → `ASK_CANCELLED_ACK`, no agent run, no pending ask. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
