---
change: work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-088` | `tests/work.pr.test.ts` | non-owner /work never calls the PR step; switched or detached worktree HEAD returns wrong-branch with no plugin calls and nothing pushed; existing gate/ship tests pass. |
