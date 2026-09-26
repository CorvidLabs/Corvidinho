---
change: parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose
artifact: design
---

# Design

- New private `SessionStore.persistWorktreeState(session)`: an `UPDATE` of
  the row's `worktree_path`, `worktree_branch`, `worktree_state`. UPDATE only,
  so a row already deleted by an ended talk or a TTL purge is never
  re-inserted.
- `parkSessionWorktree` sets `worktreeState = "parked"` and persists it
  synchronously, before `parkWorktree` starts any removal. After the removal
  it records the final state (`removed`/`parked`, path cleared) the same way.
  The early return now skips only `removed`: a `parked` row that still
  records a path is a park cut short by a crash, and parking is idempotent,
  so it is finished.
- `bindWorktree` reuses a recorded `active` worktree only when its directory
  exists. The project-switch refusal still runs first. A missing directory
  falls through to the existing `ensureTalkWorkspace` path for the session's
  own project and id (same `talk-<id>` dir; `cleanStaleWorktreeState` prunes
  the stale entry and keeps a branch with commits as
  `<branch>-parked-<ms>`). It never returns the repo root or another talk's
  directory.
- The bridge calls `bindWorktree` on every turn (it is idempotent) instead of
  only on start or when no path is recorded, so a thread continue after a
  restart goes through that check. On bind failure it ends the talk and
  replies as before.
- Untouched: schema (v4 columns already exist), `cwdFor` logic, TTL, slash
  commands, env vars.

Persisted data risk: rows now pass through `parked` while a park is in
flight. Every reader already treats non-`active` as not bound, so the only
effect is that a restarted talk re-binds a fresh worktree.
