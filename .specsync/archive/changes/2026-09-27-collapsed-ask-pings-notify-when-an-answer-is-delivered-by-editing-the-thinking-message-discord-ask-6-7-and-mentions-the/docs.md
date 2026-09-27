---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: docs
---

# Docs

`specs/discord/discord.spec.md` documents the new exports
(`formatCollapsedPing`, `COLLAPSED_PING_QUESTION` / `COLLAPSED_PING_NEEDS`,
`CollapsedPing`, `postCollapsedPing`, `ChannelPost.replyToMessageId`), the
no-double-ping invariant, a behavioral example and the failed-ping error case;
`specs/discord/testing.md` lists the new test file and the updated ones. The
module headers of `ask-ping.ts` and `spend-post.ts` describe the ping. No
operator knob, slash command or env var, so no operator guide change; the
human UX inventory (`docs/discord.md`) is not an acceptance source and is
left for a docs pass.
