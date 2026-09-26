---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-202` | `tests/worktree.project-scope.test.ts` | absolute path, `../` traversal, symlink escape and `/` refused with not authorized; sibling needs an allowlisted origin (deny wins, no allowlist = deny, plain dir refused); non-admin `/work` and `/session start` with the private repo run no agent and leave no session, talk branch or worktree in it; an allowlisted sibling still runs in its own worktree; `/schedule create` refuses and stores nothing; a stored out-of-scope schedule tick fails not authorized with no agent run. 4 of 6 failed before the fix, 6 of 6 pass after. |
| `REQ-discord-022` | `tests/discord.session-worktree.test.ts`, `tests/discord.schedule.test.ts`, `tests/worktree.test.ts` | an explicit allowlisted sibling project still freezes; a mid-talk switch is still refused; default-root and in-root projects unchanged. |
