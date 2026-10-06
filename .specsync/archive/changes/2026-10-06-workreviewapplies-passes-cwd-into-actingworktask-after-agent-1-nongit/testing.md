---
change: workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit
artifact: testing
---

# Testing

- `bunx tsc --noEmit` clean on the tip that includes this call-site fix.
- Existing `tests/work.review.test.ts` `workReviewApplies` cases still pass
  with the optional third arg defaulting to `process.cwd()` (Corvidinho is a
  git repo in CI, so the /work bit still reads as before for those stamps).
