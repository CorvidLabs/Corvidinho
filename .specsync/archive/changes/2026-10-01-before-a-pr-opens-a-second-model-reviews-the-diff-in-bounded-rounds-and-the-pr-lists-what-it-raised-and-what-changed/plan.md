---
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
artifact: plan
---

# Plan

1. Capture GITHUB-9.a with `hi` (one commit); `hi check`.
2. `runGit` `indexFile`; plugin types and `runPlugin` pass-through.
3. `src/work/review.ts` (reviewer, tree, diff, call, rounds table, section,
   gate) and the `github-pr-create` wiring.
4. Tool loop: authors, review context, spend stop, AGENT-16 exemption,
   reply note; delegate authors / models.
5. /work `not-reviewed`; `SCRUB_TARGETS`.
6. Tests: `tests/work.review.test.ts` (+ `tests/fixtures/review-cycle.ts`);
   update the dry-run PR tests that now need a finished review.
7. Fail-on-base proof: swap the base's nine modified sources in (new module
   kept), run, stub the missing exports so the new file loads, run, restore.
8. Docs (README, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/WATCH.md),
   spec prose, deltas, module testing notes.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
