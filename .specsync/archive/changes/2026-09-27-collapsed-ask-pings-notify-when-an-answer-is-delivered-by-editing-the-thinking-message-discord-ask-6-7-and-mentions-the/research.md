---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: research
---

# Research

- `src/discord/bridge.ts` `onMessage` / `onComponent`: the answer body is
  `withSpendWarningPost({ content, mentionUserIds: askBody.mentionUserIds },
  warning, owner)`; `thinking.finalizeContent` edits it into the progress
  message (or Choose stub). On success nothing else is posted; only the
  fallback branch calls `replyRef.fn` (a fresh reply that notifies).
- `src/discord/gateway.ts`: `editMessage` passes `allowedMentions` on
  `msg.edit` (no notification on edit); `reply` sends a new message with
  `allowedMentions { parse: [], users: mentionUserIds, repliedUser: true }`
  — replying to the bot's own collapsed answer pings no one else.
- `src/discord/spend-post.ts` `finishSlashWithOwnerNotice` (#160): the slash
  body (clarify → requester mention via `formatAskReply(owner: null)`) is
  collapsed; the owner notice (stuck / spend-cap line, 80% warning) is a fresh
  `post`; with no notice the function just calls `finishSlashWithThinking`,
  so a collapsed `/work` or `/session start` clarify never notifies the
  requester. When the notice post fails, the notice is appended to the
  collapsed answer (an edit again).
- `askPingOwner` / `claimCapPing` already dedupe the spend-cap owner ping per
  episode: a deduped ask formats with `owner: null`, so it carries no owner
  mention. Chat / button-pick paths send no separate owner post, so nothing
  else can double-ping there.
- Repro on main: `tests/discord.collapsed-ping.test.ts` bridge tests (without
  the new formatter import) — 9 fail (no fresh post after a collapsed clarify,
  Choose stub, stuck, clarify+warning, spend cap, button pick, `/work`
  clarify, appended notice), 6 pass (the no-extra-post cases).
