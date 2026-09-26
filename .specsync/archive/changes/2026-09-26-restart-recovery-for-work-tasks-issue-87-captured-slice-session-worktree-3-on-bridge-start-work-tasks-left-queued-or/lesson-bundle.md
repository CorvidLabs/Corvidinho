# Lesson bundle — restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Restart recovery for /work tasks (issue #87 captured slice, SESSION-WORKTREE-3): on bridge start, work tasks left queued or running by a dead process are marked failed with an honest summary and their abandoned talk is ended (worktree parked, session dropped) so /status never shows ghost running work and no later talk reuses the stale cwd; durable queue, repo locks and resume stay draft AUTONOMOUS-14
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/work-store.ts, src/discord/bridge.ts, tests/discord.work-store.recovery.test.ts, specs/discord/
- **Acceptance**: WorkStore.recoverAbandoned marks every queued/running task failed with an honest 'abandoned: the bridge restarted while this work was <status>' summary, persisted; completed/failed tasks untouched; idempotent; startBridge (DB-backed, no injected WorkStore) runs it before handling new work and ends each abandoned task's talk session (parks its worktree, drops the session) per SESSION-WORKTREE-3; logs the count; no queue/resume/locks (draft AUTONOMOUS-14); fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `45f13111df97663f3725d8b40eed3f0884b73870`
- Base commit: `1b69c1fa30e33c64a52174a968583323c20658a8`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #87 (M3). Only the restart-hygiene part is captured (SESSION-WORKTREE-3: ending or abandoning a talk cleans up or parks its worktree; no silent leftover reused as cwd). /work runs synchronously; if the bridge dies mid-run the task row stays `running` forever and /status counts it. The durable queue, priorities, repo locks, concurrency cap and resume are draft AUTONOMOUS-14 — not built.

## From the change's testing.md

# Testing

- `tests/discord.work-store.recovery.test.ts`: reopen DB → queued/running failed + persisted, completed untouched, idempotent; startBridge fails abandoned work and ends its session.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-087 | `tests/discord.work-store.recovery.test.ts` |

## Where these lessons go

- `specs/discord/context.md`
