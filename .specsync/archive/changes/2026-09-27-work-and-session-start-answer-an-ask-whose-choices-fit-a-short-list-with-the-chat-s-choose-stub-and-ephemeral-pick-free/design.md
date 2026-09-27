---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: design
---

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
