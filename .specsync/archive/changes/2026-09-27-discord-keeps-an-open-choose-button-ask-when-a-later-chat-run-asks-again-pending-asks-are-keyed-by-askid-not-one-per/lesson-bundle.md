# Lesson bundle — discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord keeps an open Choose button ask when a later chat run asks again: pending asks are keyed by askId, not one per session (SESSION-MULTI-3)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/session-store.ts, src/discord/bridge.ts, src/discord/types.ts, tests/discord.ask-ephemeral.test.ts, docs/discord.md
- **Acceptance**: While a user's Choose button ask is open, a later chat message whose run asks again (buttons or free text) stores the new ask as the session's pendingAsk without replacing the earlier button ask: the earlier Choose/pick buttons still open the ephemeral choices and resume the session with that ask's question and label until pressed or expired (SESSION-MULTI-3 / DISCORD-ASK-3/5); a press is matched by askId across every open ask of the session; a pick, a late press (ASK_CHOICE_EXPIRED) or a free-text answer clears only that ask and the newest remaining open ask becomes pendingAsk (thin reply restates it); an explicit cancel still clears the session's open asks; an earlier free-text ask is still replaced by a new ask; open asks persist in discord_sessions.pending_ask (one object as today when one ask is open, a JSON array when several are) and survive a store reopen; no schema version bump, no new flags, env vars, config keys or slash commands; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `9981b88e0676aa8d2035318f6970d42043525cff`
- Base commit: `1c7b6ced470e0ed87e4c854f2663111713af3fa7`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

HI (captured, `hi/session.md`): **SESSION-MULTI-3** — "The same user can keep
chatting while buttons are open; new messages continue their conversation;
buttons remain until press or timeout (do not replace pending ask on a new
message)."

Gap on main (1c7b6ce, re-checked on 0940db3 after #244): the session held one `pendingAsk`. A chat message sent
while a Choose ask was open ran the agent; when that run asked again,
`bridge.ts` called `store.setPendingAsk(session, pendingToStore)`, which
overwrote the open button ask. `onComponent` found the session by
`s.pendingAsk?.askId === parsed.askId`, so the earlier Choose / option
buttons answered "This choice isn’t for you (or it was already answered)."
before any press or timeout. Repro (bridge fixture, main source): open ask A,
side-chat run asks B, press A's Choose → "This choice isn’t for you (or it was
already answered).", press A's option → same, no resume.

Constraints: no SQLite schema bump (the `pending_ask` TEXT column carries the
new shape), no new slash command / env / config key. Open PR #232 (ask-button
actor gate + mute/rate) touches the same `onComponent` block; this change
does not touch its gates.

## From the change's design.md

# Design

- `SessionStub.pendingAsk` keeps its meaning: the newest open ask (thin-ack
  restate, free-text answer, slash handlers and existing readers unchanged).
- New optional `SessionStub.openAsks`: earlier button asks still open under a
  newer `pendingAsk`, oldest first, one per askId.
- `SessionStore.setPendingAsk(session, ask)`: upsert by askId. A new askId
  becomes `pendingAsk`; the superseded ask moves to `openAsks` when it is a
  button ask (has options) and is dropped when it is free text. A held askId
  (e.g. the `stubMessageId` update after posting) is updated in place.
  `null` clears every open ask (explicit cancel, as before).
- `SessionStore.clearPendingAsk(session, askId)`: clear one ask (pick, late
  press, free-text answer, post-run free-text clear); the newest remaining open
  ask that has not timed out is promoted to `pendingAsk`, so "pendingAsk set"
  still means "an ask is open" for the thin-ack/cancel gate. Earlier asks
  already past their timeout are dropped then (never promoted): a thin reply
  must not restate buttons that only answer "that choice expired", nor keep
  thin replies from reaching the agent.
- `SessionStore.findPendingAsk(askId)`: the live session (via `list()`, which
  purges expired sessions, as the old lookup did) and the matching ask.
- Bridge: `onComponent` looks the press up with `findPendingAsk`, and the
  expired / pick paths clear only the pressed ask; the chat free-text answer
  and the post-run free-text clear use `clearPendingAsk`; cancel still calls
  `setPendingAsk(session, null)`.
- Persistence: `discord_sessions.pending_ask` holds one JSON object when one
  ask is open (unchanged format) and a JSON array (oldest first, newest last)
  when several are. Parse accepts both; an older build reading an array sees
  no pending ask (`askFromUnknown` rejects arrays). No schema version bump.

Alternatives considered: renaming `pendingAsk` to a list (touches every
reader and many tests, conflicts with open PRs); one map keyed by askId with a
derived newest (same persistence, more churn). Chosen: smallest diff that keys
presses by askId.

Design choices pending Leif: cancel clears every open ask (not only the
newest); expired earlier asks are kept (so a late press still gets "that
choice expired") until pressed, cancelled, a newer ask is cleared (then they
are dropped, not promoted) or the session ends — no cap on how many stay open.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a side-chat run that asks again keeps the earlier Choose buttons until pressed" | Ask A open, side-chat run asks B: B pending, A in `openAsks`; `ok` restates B; A's Choose opens "Which DB?"; A's pick resumes with A's question + "Postgres"; B stays pending; re-press of A is a no-op; B's pick resumes with "Redis". Fails on main (A replaced; press → "isn’t for you"). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a free-text answer clears only that ask; the earlier button ask stays open" | Free-text answer carries the prior question and clears only it; A pending again and its pick resumes. Fails on main. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "a late press on an earlier ask expires only that ask" | Late press on A → `ASK_CHOICE_EXPIRED`, no run; B still pending and opens. Fails on main. |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "an earlier ask past its timeout is never promoted, so a thin reply after the newest pick runs the agent" | A timed out, B picked: A dropped (no pending ask, no `openAsks`); `ok` runs the agent instead of restating "Which DB?"; a press on A is a no-op. Fails on main (A replaced by B, so the test's A/B setup never holds). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "an explicit cancel clears every open ask of the session" | Both asks open before the cancel; `cancel` → `ASK_CANCELLED_ACK`, no run, no open asks; presses on A and B are no-ops. Fails on main (A is not open before the cancel). |
| `REQ-discord-044` | `tests/discord.ask-ephemeral.test.ts` › "SessionStore keeps open asks by askId and persists them across a reopen" | One ask → object row; two → array row, reload as `pendingAsk` + `openAsks`; in-place update; `findPendingAsk`; promotion on clear; free-text replaced, button kept; `null` clears all. Fails on main. |

## Fail-on-main proof

Swapping main's `src/discord/{session-store,bridge,types}.ts` in: all 6 new
tests fail; restored branch source: 10/10 pass in the file.

## Automated coverage

- `bun test tests/discord.ask-ephemeral.test.ts`
- `bun test tests/discord.*.test.ts` (no regressions in existing pending-ask, slash, spend, collapse, inflight tests)
- `bunx tsc --noEmit`

## Where these lessons go

- `specs/discord/context.md`
