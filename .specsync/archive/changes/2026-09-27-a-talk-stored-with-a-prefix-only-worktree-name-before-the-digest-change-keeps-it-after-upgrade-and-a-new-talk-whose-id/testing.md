---
change: a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id
artifact: testing
---

# Testing

`tests/discord.session-worktree.test.ts` › *default talk names carry a digest
of the full session id (REQ-discord-241)* › *after upgrade, a talk stored with
a prefix-only name keeps it, and a new talk sharing that prefix never wipes
it*. It uses a temp git repo, a temp DB file and `WORKTREE_BASE_DIR` under the
temp root. It creates talk A's worktree with the old prefix-only names, writes
an uncommitted file and stores A's row as `active`. It then reopens the store
(a bridge restart), re-binds A, and creates talk B with an id that shares A's
first 16 chars. With `main`'s `src/worktree/manager.ts` swapped in, it fails:
`Expected: not ".../wts/talk-sess_0123456789a"` (B got A's dir). With the
digest fix it passes. All `talk/*` branches and worktrees stay in the temp
repo, which is removed in `finally`.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-241` | `tests/discord.session-worktree.test.ts` › after upgrade, a talk stored with a prefix-only name keeps it, and a new talk sharing that prefix never wipes it | After a store reopen, `bindWorktree` on the pre-digest talk returns its stored `talk-sess_0123456789a` path and `talk/sess_0123456789a` branch. |
| `REQ-discord-241` | `tests/discord.session-worktree.test.ts` › after upgrade, a talk stored with a prefix-only name keeps it, and a new talk sharing that prefix never wipes it | `createWithWorktree` for `sess_0123456789a22222` gets a different dir and branch; A's `a-wip.txt` survives, A's worktree is still on its branch and `cwdFor(A)` is unchanged. |
| `REQ-discord-241` | `tests/worktree.test.ts` › ids sharing a 16-char prefix get distinct default worktrees; B's setup leaves A's live worktree alone | Default names differ for two ids sharing 16 chars and are stable per id; git and non-git setups keep A's files. |
