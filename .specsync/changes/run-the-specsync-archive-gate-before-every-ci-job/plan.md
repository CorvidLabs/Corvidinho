---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: plan
---

# Plan

## Approach

Add a first job, id `archive-gate` and display name `Archive`, to every
workflow that runs on pull requests or pushes to main (`ci.yml`,
`spec-sync.yml`). It checks out the pull request head with
`actions/checkout@v4` (the ref these workflows already use, without
credentials) and runs `CorvidLabs/spec-sync@106aaa4` with
`archive-gate-only: 'true'`. Every existing job gains `needs: archive-gate`.

## Out of scope

- `release.yml` (push to main / tags / dispatch only; no pull request runs).
- The org ruleset that requires the `Archive` check.
- Moving the pin to a release tag; that follows the first release with the gate.
- Any change to what `spec-sync` or `smoke` run.

## Steps

1. Add the `archive-gate` job to the top of `jobs:` in `ci.yml` and
   `spec-sync.yml`; add `needs: archive-gate` to `smoke` and `spec-sync`.
2. Parse both files and print each job's needs.
3. Let `tests/specsync.check-parity.test.ts` ignore the
   `archive-gate-only` step.
4. Approve, `change check --commit`, review, finalize on this branch.
5. `archive-readiness.sh`, `specsync change audit --strict`,
   `specsync check --require-coverage 100`.

## Risks

- The pin is a commit on spec-sync main, not a release; it must be moved to a
  release tag later.
- A skipped job counts as passing, so without the ruleset requiring
  `Archive` a red gate alone does not block the merge.
- The extra job adds a few seconds before `smoke` and `spec-sync` start.

## Constraints consulted

- AGENTS.md PROCESS-2: the full SpecSync change cycle runs for this change
  (new, approve, check, review, finalize) in the same PR.
- AGENTS.md PROCESS-1 / HI-first: no criterion was invented or captured in
  `hi/`; this is CI ordering, not a product decision.
- AGENTS.md: `spec-sync.yml` stays required in CI and keeps its Action step.
- `tests/specsync.archive-review.test.ts`: the review is recorded at its own
  time, not in the same second as finalization.
