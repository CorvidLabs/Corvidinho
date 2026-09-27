---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: context
---

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
