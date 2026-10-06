---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: design
---

# Design

- **review.ts — one step, two drivers.** `gate()`'s run-model half becomes
  `reviewStep(db, input)` → `ReviewStep` (`finished` with the cycle and tree,
  `findings` with the round, or `refused` with the line). `gatePrCreate`
  keeps its behaviour (step, then the GitHub branch check). `reviewTree`
  takes `{untracked}`: `git add --all` into the same index copy for `/work`
  (a secret-looking untracked file's content is still withheld by
  `reviewDiffText`; the commit tools refuse it anyway).
- **The `/work` driver.** `workReviewTarget(cwd)` reads (repo, branch, base)
  the way `openWorkPr` does (`origin`'s push URL slug, the branch checked
  out, `resolveBase`). `reviewWorkRound` runs `reviewStep` with
  `untracked: true` and the fixed title `Corvidinho /work task` (the run's
  task text carries identity and project-memory blocks; a second provider
  does not need them). `workReviewFeedback` is the next attempt's feedback:
  what to do, then the findings in an untrusted-data fence, at most 3800
  characters (under the 4000 verify feedback cap, so the excerpting never
  cuts the fence). `workReviewHook` adapts it to `RunTaskOptions.review`
  (`maxRounds` = `REVIEW_MAX_ROUNDS`) and turns `ReviewSpendStop` into the
  run's spend-cap ask via `takeSpendAsk`.
- **loop.ts.** After a green lane and the AGENT-18.a settle, before done:
  call the hook. `findings` → `verifyFeedback` and `continue` (the next
  attempt goes through the verify gate again, then the next step);
  `finished` / `refused` → done and verified with `TaskResult.review`;
  `ask` → `blocked`. Its own `reviewRounds` counter (the AGENT-4.a `retries`
  untouched); past `maxRounds - 1` findings, or a throw, is `refused` (fail
  closed). The hook is only consulted on a verified tree.
- **execute.ts.** `createTaskExecute` returns `Object.assign(execute,
  { review, takeSpendAsk })` (`TaskExecuteFn`), so the hook reviews through
  the run's own models, call path, usage reporting and spend guard.
- **cli.ts.** `workReviewApplies(env, allowlist)`: surface `work`, the /work
  bit, role cap owner or team, delegation depth 0, `git-push` and
  `github-pr-create` allowlisted (no review spent on a PR that cannot open).
- **pr.ts.** Right before the commit (after the verify re-run):
  `workTreeReviewed` (the latest cycle for (repo, branch) ended on exactly
  the tree `git add --all` gives; fail closed) or `not-reviewed` with the
  run's reason (`WorkRunFacts.review`) or `WORK_REVIEW_REFUSAL.notFinished`.
  The post-push `reviewHold` handling stays as a backstop.
- **pr-body.ts.** `reviewed` adds `WORK_PR_REVIEWED_LINE` under Verify; the
  section itself is written once, by `github-pr-create` from the record
  (`reviewSection`), so a body line can never imitate it.
- **Spawn client.** `taskReviewFromUnknown` validates the frame's `review`
  (state, reason scrubbed, one line, ≤300 chars).
