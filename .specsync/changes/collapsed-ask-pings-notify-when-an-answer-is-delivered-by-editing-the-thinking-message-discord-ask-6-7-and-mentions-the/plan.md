---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: plan
---

# Plan

1. Regression tests `tests/discord.collapsed-ping.test.ts` (bridge cases fail
   on main).
2. `formatCollapsedPing` + pointer constants in `src/discord/ask-ping.ts`.
3. `postCollapsedPing` + `ChannelPost.replyToMessageId` in
   `src/discord/spend-post.ts`; ping after a collapsed slash answer in
   `finishSlashWithOwnerNotice`, skipping users the notice post pinged.
4. Wire the chat and button-pick collapse branches in `src/discord/bridge.ts`.
5. Update tests that asserted "no fresh post" after a collapsed answer with a
   mention (spend, ask-ping, ask-ephemeral, thin-ack, inflight-replies).
6. Delta REQ-discord-215, `discord.spec.md` Public API / invariants / example
   / error case, `specs/discord/testing.md`; SpecSync check, tsc, bun test,
   verify lane.
