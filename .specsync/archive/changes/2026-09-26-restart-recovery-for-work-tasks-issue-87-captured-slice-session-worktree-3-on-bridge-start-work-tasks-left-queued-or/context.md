---
change: restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or
artifact: context
---

# Context

Issue #87 (M3). Only the restart-hygiene part is captured (SESSION-WORKTREE-3: ending or abandoning a talk cleans up or parks its worktree; no silent leftover reused as cwd). /work runs synchronously; if the bridge dies mid-run the task row stays `running` forever and /status counts it. The durable queue, priorities, repo locks, concurrency cap and resume are draft AUTONOMOUS-14 — not built.
