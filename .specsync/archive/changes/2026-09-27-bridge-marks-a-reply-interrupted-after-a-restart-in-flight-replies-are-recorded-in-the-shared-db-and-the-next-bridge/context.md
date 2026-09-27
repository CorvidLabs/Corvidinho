---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: context
---

# Context

Crash/restart-recovery audit of `origin/main` (confirmed bug). When the
Discord bridge dies or restarts mid-reply (the update helper's pidfile
SIGTERM, a crash, OOM), the thinking embed stays frozen forever at
"⏳ … · working… · Ns" and the user is never told the reply was lost.

Why: the progress message id lived only in the in-memory `ThinkingStatus`
(`src/discord/thinking-status.ts`, `messageId`, set in `start()`), created
per message in `src/discord/bridge.ts` `onMessage`. No table recorded
in-flight replies, so a new process had nothing to recover from. The only
restart recovery (`WorkStore.recoverAbandoned`, SESSION-WORKTREE-3) covers
/work task rows, not message replies.

HI served: DISCORD-3 (live status instead of a silent void; a frozen
"working…" embed is a silent void), AGENT-3 (an interrupted run should not
look like it is still going).

Constraints: no new slash command, no new env var; only the bot's own
progress message or a reply to the recorded request message in the same
channel; best effort, sequential, never throws out of startup.
Schema: `main` was already at v8 (`pending_ask`, #189) when this was cut,
so the new table is v9.
