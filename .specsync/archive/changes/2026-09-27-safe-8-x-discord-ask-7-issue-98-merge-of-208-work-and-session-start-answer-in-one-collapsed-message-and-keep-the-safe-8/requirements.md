---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: requirements
---

# Requirements

SAFE-8 (hi/safe.md, as amended on #98), AUTONOMY-2/4 (hi/autonomy.md),
DISCORD-ASK-7 (hi/discord.md, #208).

- Modified `REQ-discord-098`: `/work` and `/session start` answer with the
  ask content in the one message DISCORD-ASK-7 leaves; an ask run never shows
  "✅ Done"; the owner notice stays a fresh post, appended to the answer that
  went out when that post fails, and is handed back when nothing carried it.
- `REQ-discord-048` (DISCORD-ASK-7) is unchanged: collapse on success, the
  deferred reply deleted (or thin), fallback Done/fail + reply.
