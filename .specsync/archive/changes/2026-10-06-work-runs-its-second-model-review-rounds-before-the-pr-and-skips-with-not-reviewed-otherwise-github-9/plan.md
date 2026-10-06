---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: plan
---

# Plan

1. No `hi` capture (GITHUB-9 / GITHUB-9.a are on main); `hi check`.
2. `src/work/review.ts`: split `reviewStep` out of `gate()`; `reviewTree`
   `{untracked}`; `/work` driver (`workReviewTarget`, `reviewWorkRound`,
   `workReviewFeedback`, `workReviewHook`, `workTreeReviewed`).
3. `src/agent/types.ts` + `src/agent/loop.ts`: `ReviewHook`,
   `ReviewHookResult`, `TaskReview`; the hook step after a green lane with
   its own counter.
4. `src/agent/execute.ts`: `TaskExecuteFn` with `review` and `takeSpendAsk`.
5. `src/cli.ts`: `workReviewApplies`; pass the hook in `taskRunIn`.
6. `src/work/pr.ts` / `pr-body.ts`: `not-reviewed` before the commit; the
   reviewed line. `src/discord/agent-client.ts` / `types.ts`: the frame's
   `review`.
7. Tests (`tests/agent.loop.test.ts`, `tests/work.pr.test.ts`,
   `tests/work.review.test.ts`); fail-on-base proof (swap the stacked base's
   nine sources in, run, restore, run).
8. Docs, spec prose, deltas, module testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
