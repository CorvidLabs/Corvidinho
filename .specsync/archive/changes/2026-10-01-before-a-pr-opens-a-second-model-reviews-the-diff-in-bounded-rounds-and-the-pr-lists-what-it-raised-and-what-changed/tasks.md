---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: tasks
---

# Tasks

- [x] Capture GITHUB-9.a with `hi` in its own commit; `hi check` passes.
- [x] `runGit` `indexFile`; `PrReviewRun` / `ReviewMessage` / `ReviewCompletion`, `PluginHandlerArgs.review`, `PluginHandlerResult.reviewHold`; `runPlugin` passes `review`.
- [x] `src/work/review.ts`: reviewer, temp-index tree, merge-base diff with the cap, review call and findings, `pr_review_rounds`, PR section, `gatePrCreate`.
- [x] `github-pr-create`: client before the review, the gate, `githubBranchTree` / `pushRemoteTree`, section before the attribution.
- [x] Tool loop: authors, review context through `chatCompletions` and the spend guard, `ReviewSpendStop`, AGENT-16 exemption, reply note.
- [x] Delegate: worker models back to the lead, lead authors to the worker.
- [x] /work `not-reviewed` line; `pr_review_rounds` in `SCRUB_TARGETS`.
- [x] `tests/work.review.test.ts` and `tests/fixtures/review-cycle.ts`; github-write, roles and work.pr tests updated.
- [x] Fail-on-base proof recorded in testing.md.
- [x] README, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, spec prose, deltas and module testing notes updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
