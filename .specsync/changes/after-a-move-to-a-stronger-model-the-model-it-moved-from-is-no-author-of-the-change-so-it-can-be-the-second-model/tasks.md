---
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
artifact: tasks
---

# Tasks

- [x] Reproduce on origin/main: two models plus the order, a move, then `review.authors()` names both and `resolveReviewer` is null.
- [x] `src/agent/execute.ts` `createTaskExecute`: track `keptAuthors` (the lead's, delegate workers' reported models, every failover); on a move (`escalate`, `next.ok`) drop `next.from` from `authors` unless kept.
- [x] `tests/agent.stall-escalate.test.ts`: after the move `review.authors()` is the stronger model only and `resolveReviewer` picks the weak one; in a worker whose lead names the weak model it stays an author.
- [x] Prove the new test fails with origin/main's `src/agent/execute.ts` and passes with the fix; run `tsc`, the full suite and verify.
