---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: design
---

# Design

- `buildSlashCtx()` (`src/discord/bridge.ts`) sets `trackBotMessage`:
  resolve the session id with `store.get` and call
  `store.trackBotMessage(messageId, session)`, the same map (and DB rows) the
  @mention path uses. An ended or expired session is skipped.
- `SlashInteraction.editReply` may resolve with `{ messageId }`
  (`src/discord/slash-types.ts`; `void` stays valid, so existing fakes keep
  working). The live gateway adapter (`src/discord/gateway.ts`) returns the
  id of the Message discord.js resolves `editReply` with. The `reply` path is
  unchanged: discord.js `reply()` resolves with an InteractionResponse whose
  id is not a message id.
- `finishSlashWithThinking` (`src/discord/slash-finish.ts`) tracks the
  fallback answer's id when `editReply` returns one. The collapsed path
  already called `trackBotMessage`.
- Routing is unchanged: `routeMessage` resumes a tracked message's session
  only for its own user (SESSION-MULTI-1, REQ-discord-046); other users fall
  through to the @mention path or are ignored.
