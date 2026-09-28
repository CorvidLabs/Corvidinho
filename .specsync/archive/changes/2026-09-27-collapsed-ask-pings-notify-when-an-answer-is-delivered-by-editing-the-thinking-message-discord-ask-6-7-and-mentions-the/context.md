---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: context
---

# Context

Bug on `origin/main` @ dc65cf7 (after #204/#208 DISCORD-ASK-6/7 and #160
SAFE-8): answers are delivered by editing the thinking message
(`ThinkingStatus.finalizeContent({ content, components, mentionUserIds })`,
slash via `finishSlashWithThinking`). Discord does not send notifications for
mentions added in a message edit, so on a collapsed answer:

- the clarify ping to the requester (AUTONOMY-4) never notifies — chat,
  button pick, Choose stub, `/work` and `/session start`;
- the stuck ping to the owner (AUTONOMY-2) never notifies on chat and button
  pick (slash already sends the owner a fresh notice post, #160);
- the spend-cap owner ping and the 80% warning owner mention (SAFE-8) riding
  the collapsed chat / button-pick edit never notify.

`allowedMentions` on the edit is correct but irrelevant: Discord only
notifies on create. Only the fallback path (no `editMessage`, or a failed
edit) posts a fresh reply, which notifies.

HI served: AUTONOMY-2 (owner pinged when stuck), AUTONOMY-4 (clarify asks
ping the requester), SAFE-8 (owner warned at 80% and asked at the cap),
DISCORD-ASK-6/7 (one-message layout kept). No new acceptance criteria beyond
those: the fix only makes the existing pings actually notify.

Constraints: keep ASK-6/7's one-message answer; no double pings (reuse the
#160 once-per-episode cap claim and skip users the slash owner notice already
pinged); no ping when the answer was already a fresh reply; allowed mentions
exactly the pinged users; no new slash command, env var or schema.
