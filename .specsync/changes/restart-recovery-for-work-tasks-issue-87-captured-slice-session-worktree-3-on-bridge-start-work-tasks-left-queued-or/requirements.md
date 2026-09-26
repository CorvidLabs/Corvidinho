---
change: restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or
artifact: requirements
---

# Requirements

1. `WorkStore.recoverAbandoned()` fails queued/running tasks with an honest summary; persisted; idempotent.
2. `startBridge` (DB-backed WorkStore) calls it before new work and ends each abandoned task's talk session via `SessionStore.endSession` (parks worktree, drops session).
3. No resume, queue, locks (draft AUTONOMOUS-14).
