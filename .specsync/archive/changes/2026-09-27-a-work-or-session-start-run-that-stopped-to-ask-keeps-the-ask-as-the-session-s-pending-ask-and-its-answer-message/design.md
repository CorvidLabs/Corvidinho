---
change: a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message
artifact: design
---

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
