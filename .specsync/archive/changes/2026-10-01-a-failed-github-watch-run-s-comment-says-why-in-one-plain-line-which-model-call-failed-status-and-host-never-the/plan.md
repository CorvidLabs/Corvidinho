---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: plan
---

# Plan

1. WATCH spawn client and `AgentSpawnResult`: `failureReason`, `stderrTail`.
2. `watchFailureReason`; `buildSummaryBody` / `maybePostWatchSummary` use it.
3. Poller: keep the facts, log the reason, store it as the kept agent turn,
   pass `ask` / facts / `env` to the summary.
4. Tests: `tests/watch.failed-comment.test.ts` (real `task run` against a
   429 provider with an org name and a request id; stderr / exit / throw
   fallbacks; unchanged success, ask and spend-cap); update the two WATCH
   tests that pinned the old failed body;
   `tests/daemon.no-provider-run.test.ts` for REQ-cli-079.
5. Fail-on-main proof: swap main's four `src/watch` files in, run, restore.
6. Docs (`docs/WATCH.md`), spec prose, deltas and module testing evidence.
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
