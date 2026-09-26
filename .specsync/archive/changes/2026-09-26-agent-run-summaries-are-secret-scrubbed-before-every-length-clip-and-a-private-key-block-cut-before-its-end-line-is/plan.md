---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: plan
---

# Plan

1. Write regression tests and show they fail on the current code:
   `tests/agent.summary-scrub.test.ts` (stderr 500, stdout 1800, result
   summary 1800, result frame 4000), `tests/store.scrub.test.ts` (open
   private-key block; the hostile-input test now expects open blocks to be
   redacted, still in linear time), and `tests/watch.summary-scrub.test.ts`
   (end-to-end WATCH comment and JSONL for the stderr cap and a PEM cut at 1800).
2. Scrub before the clips in `task-summary.ts` and before the cap in
   `resultFrame`. Widen the `private-key` pattern and bump
   `SCRUB_RULES_VERSION`.
3. Add the REQ-agent-232 delta and the REQ-discord-066 modified delta. Run
   typecheck, `bun test`, `specsync check --require-coverage 100`,
   `specsync change audit` and fledge verify.
