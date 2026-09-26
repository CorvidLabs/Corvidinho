---
change: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
artifact: testing
---

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
