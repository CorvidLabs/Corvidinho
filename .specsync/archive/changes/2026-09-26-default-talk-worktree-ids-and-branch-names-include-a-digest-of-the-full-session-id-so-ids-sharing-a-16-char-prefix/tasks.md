---
change: default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix
artifact: tasks
---

# Tasks

- [x] Reproduce on current `main`: two scheduler-shaped ids with default naming share one dir/branch and the second ensure wipes the first's live worktree.
- [x] Regression test in `tests/worktree.test.ts` fails on the old code (`talkWorktreeId` returns `talk-schedule_sched_a` for both ids).
- [x] `talkWorktreeId` / `generateTalkBranchName` append the first 16 hex chars of `sha256(<full id>)` to the readable 16-char prefix.
- [x] Add the `REQ-discord-241` delta (Added).
- [x] Typecheck, `bun test`, `specsync check`, fledge verify green.
