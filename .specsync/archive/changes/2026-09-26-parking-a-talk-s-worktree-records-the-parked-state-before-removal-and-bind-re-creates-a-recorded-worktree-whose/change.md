---
id: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
state: archived
type: bug_fix
base_commit: 213900d3875250f6d845b036d9eebc1ab7e1d4b1
---

# Parking a talk's worktree records the parked state before removal and bind re-creates a recorded worktree whose directory is gone, so a crash between park and row delete never leaves a dead cwd (SESSION-WORKTREE-3)

## Intent

Parking a talk's worktree records the parked state before removal and bind re-creates a recorded worktree whose directory is gone, so a crash between park and row delete never leaves a dead cwd (SESSION-WORKTREE-3)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Parking a session worktree persists worktree_state=parked before any removal side effect, so a crash between park and row delete never restarts with a row that says active at a removed directory; a park cut short (row parked, path recorded) is finished when the talk ends; bindWorktree re-creates a recorded active worktree whose directory is gone for the same project and session (never the repo root or another talk dir; project switch still refused); the bridge binds on every turn so a thread continue after restart runs in an existing worktree; fixture tests with a real temp git repo and a reopened DB file fail before and pass after

## No-spec Rationale

Not applicable
