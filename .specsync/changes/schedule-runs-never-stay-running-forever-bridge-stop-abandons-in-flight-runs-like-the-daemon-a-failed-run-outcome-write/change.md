---
id: schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write
state: verifying
type: bug_fix
base_commit: bf9a5b20b2a13f77eb503567428ff5551321bc9c
---

# Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree

## Intent

Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- Bridge stop records an in-flight schedule run failed ('interrupted: bridge shutdown'), kills its agent tree and removes its worktree and empty talk/schedule_* branch; a run-outcome write that throws once is retried and recorded, and one that throws twice is logged '[scheduler] run failed: could not record run ...' and reported as failed; bridge and daemon start mark runs a dead process (kill -9) left running as failed 'interrupted: process restarted' and remove leftover schedule-run worktrees (a branch with commits is kept), while a run another live process owns and its worktree are untouched; daemon stop waits a bounded grace so an abandoned run's worktree is gone before it exits; tests/scheduler.never-stuck.test.ts and tests/daemon.restart-recovery.test.ts cover each and fail on the previous code

## No-spec Rationale

Not applicable
