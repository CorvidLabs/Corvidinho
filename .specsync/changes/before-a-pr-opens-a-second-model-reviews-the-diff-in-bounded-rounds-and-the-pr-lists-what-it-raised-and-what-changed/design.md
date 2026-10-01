---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: design
---

# Design

- **New module** `src/work/review.ts` (owned by the plugins spec):
  `gatePrCreate` decides from the latest stored cycle for (repo, head) and,
  with a run, the work tree's id from `reviewTree` (index copy + `git add
  --all` + `write-tree` under a temporary `GIT_INDEX_FILE`, new `runGit`
  option `indexFile`). Same tree as the open round → `declined`; same tree
  as a finished cycle → no round; else the next round: `resolveReviewer`
  over `configuredModels` minus authors (run + recorded for the branch, by
  model id), merge-base with `--base`, `reviewDiffText` (200 KiB cap),
  `changedPaths` from the previous round's tree, `reviewDiff` (one
  `PrReviewRun.complete` call; `ReviewSpendStop` on a spend stop),
  `recordReviewRound`. A cycle ends `clean`, `declined` or `max-rounds`
  (round 3); an unfinished round returns the `findings` hold. A finished
  cycle then needs the branch tree on GitHub (`remoteTree`) to equal it,
  and `reviewSection` renders the body section from the stored rounds.
- **github-pr-create** (`plugins/github/commands.ts`): live mode builds its
  Octokit client first (no review spent without a token), then the gate with
  `githubBranchTree` (live) or `pushRemoteTree` (dry run);
  `withReviewAndAttribution` puts the section before the attribution.
- **Types** (`src/plugins/types.ts`): `PrReviewRun`, `ReviewMessage`,
  `ReviewCompletion`, `PluginHandlerArgs.review`,
  `PluginHandlerResult.reviewHold`; `runPlugin` passes `review` through.
- **Tool loop** (`src/agent/execute.ts`): an `authors` set fed by
  `onModel`, own and worker failovers, `delegate` `data.models` and (in a
  worker) `CORVIDINHO_DELEGATE_AUTHORS`; one `PrReviewRun` whose `complete`
  calls the existing `chatCompletions` with no tools, the spend-guarded
  fetch and the run's `onUsage`; `ReviewSpendStop` ends the attempt so
  `spend.finish` makes the ask; `reviewHold` results skip
  `repeatGuard.after`; the latest refusal line ends the summary
  (`withReviewRefusalNote`). The turn-cap / idle-watchdog regions and
  `chatCompletions` itself are untouched (providers-4 builds there).
- **Delegate** (`src/autonomous/delegate.ts`, `plugins/autonomous/commands.ts`):
  `workerModelsFromResult` → `DelegateChildOutcome.models` → `data.models`;
  `buildDelegateSpawn({ authors })` sets `CORVIDINHO_DELEGATE_AUTHORS`.
- **/work** (`src/work/pr.ts`): a held `github-pr-create` maps to
  `not-reviewed` with the gate's reason (`reviewRefusalReason`).
- **Scrub** (`src/store/scrub.ts`): `pr_review_rounds` in `SCRUB_TARGETS`.
