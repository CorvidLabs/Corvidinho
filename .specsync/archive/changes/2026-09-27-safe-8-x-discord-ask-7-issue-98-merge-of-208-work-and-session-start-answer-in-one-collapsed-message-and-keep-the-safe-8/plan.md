---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: plan
---

# Plan

1. Merge origin/main (#208, #203, #197); resolve `session.ts` / `work.ts` and
   the discord spec change-log rows.
2. Extend `finishSlashWithThinking` (`askStatus`, `mentionUserIds`,
   `onDelivered`); add `finishSlashWithOwnerNotice` in `spend-post.ts`.
3. Wire both handlers; keep #208's `tests/discord.slash-ask7.test.ts`
   unchanged; add collapsed-slash tests and restore the fallback paused-status
   assertion.
4. Delta Modified REQ-discord-098, spec prose, verify.
