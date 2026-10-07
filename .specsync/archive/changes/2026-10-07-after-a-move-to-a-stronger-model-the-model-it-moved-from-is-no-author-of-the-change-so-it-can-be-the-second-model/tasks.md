---
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
artifact: tasks
---

# Tasks

- [x] Reproduce on origin/main: two models plus the order, a move, then `review.authors()` names both and `resolveReviewer` is null.
- [x] `src/agent/execute.ts` `createTaskExecute`: track `keptAuthors` (the lead's, delegate workers' reported models, every failover); on a move (`escalate`, `next.ok`) drop `next.from` from `authors` unless kept.
- [x] `tests/agent.stall-escalate.test.ts`: after the move `review.authors()` is the stronger model only and `resolveReviewer` picks the weak one; in a worker whose lead names the weak model it stays an author.
- [x] Prove the new test fails with origin/main's `src/agent/execute.ts` and passes with the fix; run `tsc`, the full suite and verify.
- [x] Review follow-up: record the run's authors only after a call AGENT-17 counts as a change (`editsUnreported` shared with the stall guard), so a `delegate` refused before any worker ran records nothing; `tests/agent.stall-escalate.test.ts` checks the checkout's `pr_change_authors` record in a git repo (fails with the PR's first `src/agent/execute.ts` and with origin/main's).
