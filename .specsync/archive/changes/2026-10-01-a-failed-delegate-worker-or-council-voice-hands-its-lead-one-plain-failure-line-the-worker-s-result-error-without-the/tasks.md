---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: tasks
---

# Tasks

- [x] `withoutProviderHost` in `src/agent/providers.ts`;
  `watchPublicFailureLine` returns it.
- [x] `workerFailureLine`, `WORKER_TIMED_OUT_LINE`,
  `WORKER_INTERRUPTED_LINE` in `src/autonomous/delegate.ts`;
  `runDelegateChild` uses it for a failed worker and keeps `resultText` for
  one that did not fail.
- [x] Council core comments (`src/autonomous/council.ts`).
- [x] `FakeHttpError` in `tests/fixtures/fake-llm.ts`.
- [x] `tests/autonomous.worker-failure.test.ts`; the SAFE-6 case in
  `tests/autonomous.delegate.test.ts` now asserts the plain line.
- [x] Fail-on-main proof (main's `src/autonomous/delegate.ts` swapped in,
  run, restored).
- [x] Deltas REQ-agent-117 / REQ-agent-118 / REQ-watch-009;
  `specs/agent/{agent.spec,testing}.md`, `specs/watch/watch.spec.md`.
- [x] Change check, coverage, `hi check`, `tsc`, `bun test`, verify lane.
