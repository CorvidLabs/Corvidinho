---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: tasks
---

# Tasks

- [x] Confirm GITHUB-9 / GITHUB-9.a are captured on main; nothing new to capture; `hi check` passes.
- [x] `src/work/review.ts`: `reviewStep` shared by `gatePrCreate` and the `/work` driver; `reviewTree(root, {untracked})`; `workReviewTarget`, `reviewWorkRound`, `workReviewFeedback`, `workReviewHook`, `workTreeReviewed`, `WORK_REVIEW_*`.
- [x] `src/agent/types.ts` / `src/agent/loop.ts`: `ReviewHook`, `ReviewHookResult`, `TaskReview`, `RunTaskOptions.review`, `TaskResult.review`; the hook step with its own counter, fail closed.
- [x] `src/agent/execute.ts`: `TaskExecuteFn` (`review`, `takeSpendAsk`).
- [x] `src/cli.ts`: `workReviewApplies`; the hook passed for owner and team `/work` runs.
- [x] `src/work/pr.ts` / `src/work/pr-body.ts`: `not-reviewed` before the commit with the run's reason; `WORK_PR_REVIEWED_LINE`.
- [x] `src/discord/agent-client.ts` / `src/discord/types.ts`: `taskReviewFromUnknown`, `task.review`.
- [x] Tests in `tests/agent.loop.test.ts`, `tests/work.pr.test.ts`, `tests/work.review.test.ts`; fail-on-base proof recorded in testing.md.
- [x] `tests/agent.test-evidence.test.ts`, `tests/agent.repo-ways.test.ts`, `tests/agent.hi-guard.test.ts`: their stubbed `/work` shipping cases inject `reviewed` (the GITHUB-9 check now runs before the commit).
- [x] docs/discord.md, docs/DISCORD-GO-LIVE.md, spec prose (agent, cli, discord, plugins), deltas and module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
