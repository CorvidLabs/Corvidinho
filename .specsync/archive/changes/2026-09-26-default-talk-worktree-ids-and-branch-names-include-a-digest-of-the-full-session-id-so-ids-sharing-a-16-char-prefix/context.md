---
change: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
artifact: context
---

# Context

Bug `store-memory-audit-1` (high): `talkWorktreeId` and
`generateTalkBranchName` in `src/worktree/manager.ts` kept only the first 16
characters of the sanitized session id. Any two ids that share that prefix
map to one worktree dir and one `talk/` branch. The scheduler's id shape
`schedule_<schedule.id>_<run.id>` keeps only `schedule_sched_<c>`, so every
schedule fell into one of 16 names and the run id was ignored.

PR #178 (REQ-discord-203) already closed the scheduler path at the call site
(it passes explicit `talk-<full run key>` / `talk/<full run key>` names) and
made stale-branch cleanup park a branch with commits instead of
`git branch -D`. The shared default naming in the manager was left as is, so
any `ensureTalkWorkspace` caller relying on the defaults still collides.
Reproduced on current `main` (temp git repo, two scheduler-shaped ids, default
naming): both ids gave `talk-schedule_sched_a` / `talk/schedule_sched_a`, the
second ensure returned the same dir, and the first talk's uncommitted
`a-wip.txt` was gone (its live worktree was force-removed and recreated).
Non-git projects hit the same thing through `scoped-<worktreeId>`.

Fix, kept small: the default name part is now the same readable 16-char prefix
plus `-` and the first 16 hex chars of `sha256(<full raw id>)`, e.g.
`talk/sess_0123456789a-<digest>`. Deterministic per id, so re-binding the
same session still lands on the same name (stale cleanup of that name works
as before). Explicit `worktreeId` / `branchName` overrides (the scheduler's)
are unchanged. Stored `worktree_branch` / `worktree_path` of existing
sessions are read back as stored, so nothing persisted changes shape.

Out of scope (left as risk): `cleanStaleWorktreeState` still force-removes an
existing dir at the same path, which is the intended stale-cleanup path for the
same id; it no longer collides across different ids. No new env vars, slash
commands or schema changes.
