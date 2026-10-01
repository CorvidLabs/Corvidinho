---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: plan
---

# Plan

1. Move #343's host-stripping into `withoutProviderHost`
   (`src/agent/providers.ts`); `watchPublicFailureLine` returns it.
2. Add `workerFailureLine` to `src/autonomous/delegate.ts` and use it in
   `runDelegateChild` for a failed worker; `resultText` only when it did
   not fail; update the council comments.
3. Let the fake LLM answer a scripted HTTP error with a raw body.
4. Tests: the line's sources; fake-bin failures (model error, idle timeout,
   no frame, ask, success); the SAFE-13 fence; end to end through the lead's
   tool loop and a council with the real `task run` against a 429 provider.
5. Prove the new tests fail with main's delegate core, then pass.
6. Deltas and specs; change check, coverage, `hi check`, `tsc`, `bun
   test`, the verify lane.
