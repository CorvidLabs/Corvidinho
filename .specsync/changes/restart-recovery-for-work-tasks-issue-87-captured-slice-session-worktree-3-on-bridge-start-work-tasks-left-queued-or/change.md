---
id: restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or
state: approved
type: feature
base_commit: 1b69c1fa30e33c64a52174a968583323c20658a8
---

# Restart recovery for /work tasks (issue #87 captured slice, SESSION-WORKTREE-3): on bridge start, work tasks left queued or running by a dead process are marked failed with an honest summary and their abandoned talk is ended (worktree parked, session dropped) so /status never shows ghost running work and no later talk reuses the stale cwd; durable queue, repo locks and resume stay draft AUTONOMOUS-14

## Intent

Restart recovery for /work tasks (issue #87 captured slice, SESSION-WORKTREE-3): on bridge start, work tasks left queued or running by a dead process are marked failed with an honest summary and their abandoned talk is ended (worktree parked, session dropped) so /status never shows ghost running work and no later talk reuses the stale cwd; durable queue, repo locks and resume stay draft AUTONOMOUS-14

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- WorkStore.recoverAbandoned marks every queued/running task failed with an honest 'abandoned: the bridge restarted while this work was <status>' summary, persisted; completed/failed tasks untouched; idempotent; startBridge (DB-backed, no injected WorkStore) runs it before handling new work and ends each abandoned task's talk session (parks its worktree, drops the session) per SESSION-WORKTREE-3; logs the count; no queue/resume/locks (draft AUTONOMOUS-14); fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
