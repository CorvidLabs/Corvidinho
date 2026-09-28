# Lesson bundle — default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Default talk worktree ids and branch names include a digest of the full session id so ids sharing a 16-char prefix never share a worktree
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/worktree/manager.ts, tests/worktree.test.ts
- **Acceptance**: talkWorktreeId and generateTalkBranchName return distinct, deterministic names for two ids that share their first 16 characters (e.g. schedule_sched_a1111111_run_aaaa and schedule_sched_a2222222_run_bbbb); ensureTalkWorkspace with such ids and default naming creates two different worktree dirs and talk branches (or two scoped dirs for a non-git project), and creating the second leaves the first's live working tree and uncommitted files in place

## Evidence

- Verification commit: `913c584e889f5785c854d29ae62e8af169ab84e2`
- Base commit: `faa569f4ac361e7a3eff3ae3a2047227410c803d`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

# Testing

`tests/worktree.test.ts` builds a real temp git repo (plus a plain non-git
dir) with `WORKTREE_BASE_DIR` under the temp root, and calls
`ensureTalkWorkspace` with default naming for two scheduler-shaped ids that
share their first 16 characters. Before the fix the new test fails at the first
assertion (`Expected: not "talk-schedule_sched_a"`); after the fix it passes,
and the rest of `bun test` stays green. All `talk/*` branches and worktrees
live in the temp repo, removed in `finally`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-241` | `tests/worktree.test.ts` › ids sharing a 16-char prefix get distinct default worktrees; B's setup leaves A's live worktree alone | `talkWorktreeId` / `generateTalkBranchName` differ for `schedule_sched_a1111111_run_aaaa` and `schedule_sched_a2222222_run_bbbb` and are stable for the same id. |
| `REQ-discord-241` | `tests/worktree.test.ts` › ids sharing a 16-char prefix get distinct default worktrees; B's setup leaves A's live worktree alone | In a git repo, B's ensure returns a different dir and branch; A's uncommitted `a-wip.txt` survives and A's worktree is still on its own branch. |
| `REQ-discord-241` | `tests/worktree.test.ts` › ids sharing a 16-char prefix get distinct default worktrees; B's setup leaves A's live worktree alone | In a non-git project, B's scoped dir differs from A's and A's `a-note.txt` survives. |

## Where these lessons go

- `specs/discord/context.md`
