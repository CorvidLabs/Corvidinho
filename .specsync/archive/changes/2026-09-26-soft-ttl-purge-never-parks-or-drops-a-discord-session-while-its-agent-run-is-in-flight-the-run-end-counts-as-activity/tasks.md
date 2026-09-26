---
change: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
artifact: tasks
---

# Tasks

- [x] Add `activeRuns` + `runActive()` to `SessionStore`; skip purge for busy sessions; touch on run end.
- [x] Wrap `runChat` in `store.runActive` in the bridge, `/work` and `/session start`.
- [x] Regression fixtures in tests/discord.session-worktree.test.ts (fail before, pass after).
- [x] Spec delta REQ-discord-204.
