---
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
artifact: docs
---

# Docs

`docs/discord.md` (SESSION-WORKTREE table) now shows the default branch as
`talk/{sessionPrefix}-{digest}` (16-char id prefix plus the first 16 hex of
sha256 of the full id) and the schedule-run branch as
`talk/schedule_{scheduleId}_{runId}`, matching `src/worktree/manager.ts` and
`src/scheduler/service.ts`. CHANGELOG entries for past releases are history
and stay as written.
