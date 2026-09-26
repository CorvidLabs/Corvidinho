---
change: restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or
artifact: testing
---

# Testing

- `tests/discord.work-store.recovery.test.ts`: reopen DB → queued/running failed + persisted, completed untouched, idempotent; startBridge fails abandoned work and ends its session.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-087 | `tests/discord.work-store.recovery.test.ts` |
