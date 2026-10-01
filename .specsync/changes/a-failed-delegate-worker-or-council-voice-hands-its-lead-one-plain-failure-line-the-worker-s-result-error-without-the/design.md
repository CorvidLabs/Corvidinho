---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: design
---

# Design

- **Shared host-free helper** (`src/agent/providers.ts`):
  `withoutProviderHost(reason)` — #343's `MODEL_CALL_HOST_RE` and body,
  moved next to `modelCallFailedLine` whose shapes it matches.
  `watchPublicFailureLine` (`src/watch/summary.ts`) now returns it, so
  WATCH's behaviour is unchanged and there is one copy. Not imported from
  `src/watch/summary.ts` directly: the delegate core is loaded by
  `cli.ts`, `verify.ts`, `must-ask.ts` and others, and the WATCH module
  pulls in Octokit.
- **`workerFailureLine(facts, env, tier)`** (`src/autonomous/delegate.ts`):
  timeout line / interrupt line (the existing harness text); else the
  result `error` through `failureReasonFromUnknown` + `plainFailureLine`
  (scrub, one line, ≤ 200 chars) + `withoutProviderHost`; else
  `providerNotice(env, [tier])` (the worker's own env, so its tier) as one
  line; else `the worker failed (exit N)`. Never stderr: unlike
  `failureReasonFor` there is no stderr fallback, because a worker's stderr
  can carry the provider body.
- **`runDelegateChild`**: `failed` = timed out, aborted, or not (`done` with
  exit 0) and no valid result `ask` (the REQ-watch-086 precedent: a run that
  stopped on an ask of its own keeps its `Needs your input: …` summary). A
  failed worker's `summary` is `workerFailureLine`; `resultText` is set
  only when it did not fail. `state`, `exitCode`, `filesChanged`,
  `verified`, `injection`, `modelFallback`, `models`, `stopReason` are
  read exactly as before.
- **Consumers unchanged in code**: the `delegate` plugin already builds
  `data.summary` and `error` from `outcome.summary`; the council core
  already quotes `out.summary` for a failed run (comments updated). The
  tool loop's SAFE-12/13 fence (`untrustedToolContent`) and AGENT-16 steer
  read the same `data.injection` / `error` as before.
- **Operator logs**: nothing new. The lead keeps no copy of the worker's raw
  summary or stderr and logs none: the lead's own stderr end is a bridge's
  fallback reason for a failed lead (`failureReasonFor`), and WATCH only
  strips a host from a whole model-call line, so a logged body or host there
  could reach a public comment. The worker's line (no host) is what the
  lead's `ToolResult` event carries.
- **Test fixture**: `tests/fixtures/fake-llm.ts` `reply` may return
  `FakeHttpError` (`httpStatus`, raw `body`, `headers`).
