# Lesson bundle — a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A /work or /session start run that stopped to ask keeps the ask as the session's pending ask and its answer message continues the session, so a thin reply restates the question, cancel clears it and a substantive reply resumes with the question as context (AUTONOMY-1/5/6, REQ-discord-044); a spend-cap stop is never pending
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/bridge.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, tests/discord.slash-pending-ask.test.ts, specs/discord/, docs/discord.md
- **Acceptance**: A /work or /session start run whose agent stopped with a clarify or stuck ask stores that ask as the session's pending ask (free text, like the answer shows it) and /work records the task blocked, not completed (stuck stays failed). The slash answer message (the thinking message edited into the answer) is tracked so a plain reply to it continues the session. A thin reply (ok, k, ...) to it restates the question and does not run the agent; cancel clears the pending ask with the short ack and does not run the agent; a substantive reply resumes the same session with the prior question as context and clears the pending ask. A SAFE-8 spend-cap stop is never stored as pending: a later ok runs the agent with no cap text. A finished run stores no pending ask and its answer still continues the session. Without an editable thinking message the pending ask is still stored, so an @mention ok restates it. Fixture tests only; no new slash command, env var or schema change.

## Evidence

- Verification commit: `c8b1bb9d8e6383e4fd45f7828e44bc1cfc63e3bf`
- Base commit: `dc65cf70d4a46d59c35f80acd91822df3eddf3f1`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Re-verified on `origin/main` at dc65cf7 (after #160). #160 fixed half of
the defect: `/work` now records a run that stopped to ask as `blocked`
(a stuck ask stays `failed`), never `completed`, and `/work` and
`/session start` post the ask through `formatAskReply` (not ✅ Done).

What remained, both confirmed with a failing fixture test on main:

- `/work` and `/session start` never stored the ask as the session's
  `pendingAsk`. So on the chat path that continues the session, a thin
  reply (`ok`) ran the agent instead of restating the question
  (AUTONOMY-5), `cancel` had nothing to clear (AUTONOMY-6), and a
  substantive answer reached the agent without the question it answered.
- The bridge's `SlashContext` never set `trackBotMessage`, so the slash
  answer message (the thinking message edited into the answer,
  DISCORD-ASK-7) was not bound to its session: a plain reply to it (no
  @mention) routed to `ignore / no_mention` and was dropped silently.

HI served: AUTONOMY-1 (a run that needs a human choice ends blocked with a
question, never done), AUTONOMY-5/6 (thin replies restate; blocked until a
substantive answer or cancel), REQ-discord-044 (pending ask semantics).
SAFE-8 rule kept from #160: a spend-cap stop is never the pending ask (a
reply cannot lift the cap).

Overlap: the task notes another in-flight fix on branch
`claude/fix-slash-answer-reply-continuity` that wires `trackBotMessage`
for slash answers. That branch and any PR for it did not exist when this was
cut, so this change carries the minimal wiring (one `buildSlashCtx` field)
and the PR body names the overlap.

Constraints: no new slash command, env var, schema change or product
surface; fixture tests only.

## From the change's design.md

# Design

- `src/discord/command-handlers/work.ts` and `session.ts`: after the run,
  when `result.ask` is set and its reason is not `spend-cap`, store
  `toPendingAsk({ reason, question })` on the new session via
  `store.setPendingAsk` (persisted like the chat path). Options are
  deliberately dropped: the slash answer is the free-text `formatAskReply`
  (no Choose buttons), so the pending ask uses the free-text semantics of
  REQ-discord-044 — a substantive reply clears it and carries the question.
  A spend-cap stop stores nothing (SAFE-8, #160). The session is new, so
  there is no older pending ask to clear.
- `src/discord/bridge.ts` `buildSlashCtx`: set
  `trackBotMessage(messageId, sessionId)` to look the session up with
  `store.get` and bind the message with `store.trackBotMessage`.
  `finishSlashWithThinking` already calls it with the collapsed answer's
  message id, so a plain reply to the slash answer routes to
  `continue_session` for the session owner (DISCORD-2 / SESSION-MULTI-1).
- Nothing else changes: the existing chat `onMessage` path does the rest
  (thin ack → restate with the reply hint, no spawn; cancel → clear with
  `ASK_CANCELLED_ACK`; substantive → clear and prepend the prior-question
  block, `resume: true`).
- Fallback (no `editMessage`): the answer is the deferred interaction
  reply, whose id the slash interaction does not expose, so it stays
  untracked as before; the stored pending ask still applies when the
  requester @mentions the bot in that channel (same-user session reuse).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.slash-pending-ask.test.ts` | 12 fixture tests through `startBridge` (fake gateway, in-memory thinking outbound with `editMessage` so the slash answer collapses as on the live gateway): `/work` clarify ask with structured options → task `blocked` (not `completed`), pending ask stored as free text, answer message maps to the session; reply `ok` → restated question with requester mention (allowed mentions exactly the requester) and reply hint, agent not run, pending kept; reply `cancel` → `ASK_CANCELLED_ACK`, pending cleared, agent not run; substantive reply → same session resumed with the prior question and `Human answer:` in the prompt, pending cleared; `/work` at the spend cap → `blocked`, no pending ask, a later `ok` runs the agent with no cap or prior-question text; `/session start` clarify → thin reply restates, substantive reply resumes with the question; `/session start` clarify with structured options → free-text pending, a substantive reply answers and clears it; `/work` stuck ask → task `failed`, pending stored, the owner notice is the one post that pings (allowed mentions exactly the owner), a thin reply restates to the owner only; another user's `ok` / `cancel` / substantive reply to the `/work` answer → agent not run, nothing posted, requester's pending ask kept; `/session start` at the cap → no pending ask; finished `/work` → `completed`, no pending ask, reply continues the session; fallback without `editMessage` → pending stored and an @mention `ok` restates without running the agent. On main (dc65cf7, and 3cdbb5c after the merge) all fail (answer message untracked, no pending ask): 0/12; 12/12 after. Mutations caught: dropping the spend-cap guard (work or session), keeping options (work or session), storing only clarify asks, removing the bridge tracking. |
| `REQ-discord-044` | `tests/discord.thin-ack.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.slash-ask7.test.ts` | Existing chat thin-ack / cancel / substantive tests, the #160 spend-cap and slash ask tests, and the DISCORD-ASK-7 slash collapse tests pass unchanged. |

Also run: `bunx tsc --noEmit`, full `bun test`,
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
