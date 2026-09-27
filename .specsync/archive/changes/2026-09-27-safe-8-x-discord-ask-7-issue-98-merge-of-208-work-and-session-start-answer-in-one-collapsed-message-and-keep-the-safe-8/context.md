---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: context
---

# Context

PR #160 (SAFE-8 as amended on #98) was finalized on its branch when main
took #208 (DISCORD-ASK-7 slash one-message, v0.0.25). #208 replaced the
`/work` and `/session start` reply with `finishSlashWithThinking`
(`src/discord/slash-finish.ts`): the thinking message is edited into the
final body and the deferred interaction reply is deleted; without
`editMessage` it falls back to a Done/fail status plus the reply.

#160 had, on the same lines, `askPingOwner` + `formatAskReply` (ask status,
AUTONOMY-4 requester addressing), `slashOwnerNotice` and
`replyWithOwnerNotice` (owner ping for stuck / spend-cap plus the 80% warning
as a fresh channel post, claims handed back when nothing went out, notice
still posted when the reply throws). Merging both made the two
command handlers conflict, and `finishSlashWithThinking` alone would have
shown an ask run as "✅ Done" in the fallback and dropped the owner notice.

Constraint from the coordinator: keep #208's collapse and its tests; keep
the owner notice a fresh post (an edit does not notify mentions); an ask run
never shows Done; claims go back when nothing carried the notice.
