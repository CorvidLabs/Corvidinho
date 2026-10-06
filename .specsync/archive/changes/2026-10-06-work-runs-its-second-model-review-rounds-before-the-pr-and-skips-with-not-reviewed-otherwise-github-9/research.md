---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: research
---

# Research

- `src/work/review.ts` (#341): `gatePrCreate` → `gate()` does, with a run
  model, the whole round step (tree, unchanged-tree end, reviewer, merge-base,
  diff, call, record) and then the GitHub branch check; without one, it only
  looks up a finished cycle for the branch's tree on GitHub. The step is
  reusable as is once it is split from the branch check.
- `reviewTree` stages tracked files only (`git add --update`), but `/work`
  commits every path `git status` shows (`git-commit --only` with the status
  paths, untracked included), so a `/work` review of tracked files only would
  never match the pushed tree whenever the run created a file. The test
  fixture `fullWorkTree` (#341) already models the `/work` tree with
  `git add --all`.
- `src/agent/execute.ts` builds the `PrReviewRun` (env, authors, one no-tools
  call through the spend-guarded fetch) per run; the spend guard's `finish`
  turns a stopped call into the spend-cap ask.
- `src/agent/loop.ts` (`runTask`): the verify retries (AGENT-4.a) feed
  `verifyFeedback`; the AGENT-18.a settle runs after a green lane, before
  done. A review belongs after that settle (the records it writes are part of
  the PR's tree).
- The Discord spawn client (`src/discord/agent-client.ts`) maps the result
  frame to `AgentSpawnResult.task`, which `/work` passes to `openWorkPr`.
- The bridge stamps `/work` runs with `CORVIDINHO_ACTING_SURFACE=work`,
  `CORVIDINHO_ACTING_WORK_TASK=1` and the role cap; workers drop the stamps
  and carry a delegation depth.
