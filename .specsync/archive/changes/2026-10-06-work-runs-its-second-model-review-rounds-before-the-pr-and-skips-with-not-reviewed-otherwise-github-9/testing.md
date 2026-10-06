---
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
artifact: testing
---

# Testing

Temp git repos with a local bare `origin` (dry-run `github-pr-create`, read
with `git ls-remote`), never this checkout; stub verify runners; scripted
review hooks and a scripted chat provider (no network, no real tokens); the
test data dir's shared DB.

- `tests/agent.loop.test.ts` "runTask second-model review before the PR" (5
  tests): findings → next attempt's feedback, verified again, finished after
  2 attempts with `maxRetries: 0`; refused → done with the reason; a hook
  that keeps raising findings is called 3 times and ends refused, a throwing
  hook ends refused; a spend-cap ask ends `blocked`; no call on a run that
  changed nothing or failed verify.
- `tests/work.review.test.ts`: the updated "/work: with no finished review
  for the tree it would ship …" (nothing committed or pushed, an earlier
  tree's review does not count, the whole-tree review opens with the
  section and the reviewed line), and "/work: an owner or team run drives
  the review rounds" (5 tests: the real tool loop + verify gate + hook with
  findings then clean, then the /work PR with the section; one configured
  model → refused and no push; the spend-cap ask; the feedback cap;
  `workReviewApplies`).
- `tests/work.pr.test.ts`: "GITHUB-9: no finished second-model review …"
  (no plugin call, nothing pushed, the run's GITHUB-9.a reason), "GITHUB-9:
  the result frame's review outcome rides AgentSpawnResult.task"; the
  opening, push-failure, PR-failure and SAFE-1 cases seed a finished review
  for the tree they ship.
- `tests/agent.test-evidence.test.ts`, `tests/agent.repo-ways.test.ts` and
  `tests/agent.hi-guard.test.ts` stub `runPlugin` to test their own `/work`
  gates (tests deleted, SpecSync coverage, hi guard); their shipping cases
  now inject `reviewed: async () => true` (`OpenWorkPrDeps.reviewed`), since
  the GITHUB-9 check comes before the commit (it is tested on its own above).

Fail-on-base proof: with the stacked base's (387dada) `src/agent/loop.ts`,
`src/agent/types.ts`, `src/agent/execute.ts`, `src/work/review.ts`,
`src/work/pr.ts`, `src/work/pr-body.ts`, `src/cli.ts`,
`src/discord/agent-client.ts` and `src/discord/types.ts` swapped in (tests
kept): `bun test tests/agent.loop.test.ts -t "second-model review"` gave 1
pass, 4 fail (findings/finished, refused, round cap and throw, spend ask; the
never-called guard passes on the base too); `bun test tests/work.pr.test.ts
-t GITHUB-9` gave 0 pass, 2 fail (the base commits and pushes before
`github-pr-create` refuses; the spawn client drops `review`);
`tests/work.review.test.ts` cannot load (`workReviewApplies` not exported).
Restored: all pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-092` | `tests/agent.loop.test.ts` "runTask second-model review before the PR" (5 tests) | findings become the next attempt's feedback and that attempt is verified again; finished / refused set `TaskResult.review`; own counter (`maxRetries: 0`), fail closed past the rounds or on a throw; spend-cap ask → blocked; no call without a verified tree. Fail on base: 4 of 5. |
| `REQ-agent-092` | `tests/work.review.test.ts` "/work: an owner or team run drives the review rounds" (first two tests) | through `createTaskExecute`, `runTask` and `workReviewHook`: round 1's finding fenced in attempt 2, round 2 clean, `review` finished; one configured model → `review` refused with the GITHUB-9.a line, no reviewer call. Fail on base: cannot load. |
| `REQ-plugins-092` | `tests/work.review.test.ts` "/work: an owner or team run drives the review rounds" (rounds, spend, feedback cap) | untracked file reviewed, fixed title, rounds stored with the changed path, `workTreeReviewed` true; spend-cap stop → the run's ask or a refusal, nothing recorded; feedback ≤ 3800 with its fence whole. Existing `github-pr-create` cases pass on the shared `reviewStep`. |
| `REQ-discord-088` | `tests/work.pr.test.ts` "GITHUB-9: no finished second-model review …", "GITHUB-9: the result frame's review outcome …"; `tests/work.review.test.ts` "/work: with no finished review …" and the owner-run PR case | `not-reviewed` before the commit with no plugin call and nothing pushed; the run's GITHUB-9.a reason words the line; an earlier tree's review does not count; the reviewed whole tree opens with the section and the reviewed line; the frame's `review` is validated and scrubbed. Fail on base: both work.pr cases. |
| `REQ-cli-092` | `tests/work.review.test.ts` "only an owner or team /work run whose PR path is allowlisted gets the review" | owner and team `/work` stamps with both plugins → hook; community, another surface, no /work bit, a worker, no stamps, a missing plugin → none. Fail on base: cannot load. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
