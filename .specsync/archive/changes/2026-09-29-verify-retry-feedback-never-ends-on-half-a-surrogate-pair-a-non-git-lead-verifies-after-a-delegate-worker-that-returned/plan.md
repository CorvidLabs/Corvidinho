---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: plan
---

# Plan

1. Re-check each W12 record on `origin/main` `5366fff` (all four reproduce).
2. Per record, write the regression test first and run it on main's source
   (fails), then make the smallest fix (passes).
3. Swap all five main source files in together, run the five touched test
   files (6 fail), restore, run again (all pass).
4. Spec prose, testing evidence, docs; deltas modify REQ-agent-002,
   REQ-agent-502, REQ-plugins-003, REQ-plugins-051 and REQ-cli-003.
5. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
