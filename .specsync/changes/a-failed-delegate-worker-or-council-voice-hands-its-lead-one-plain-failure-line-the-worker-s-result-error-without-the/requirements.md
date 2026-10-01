---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: requirements
---

# Requirements

- REQ-agent-117 (modified): a worker that failed (not `done` with exit 0,
  not stopped on an ask of its own) SHALL come back to its lead as one plain
  line (`workerFailureLine`): the timeout / interrupt line, else its result
  `error` without the provider's host, else the no-provider notice for its
  tier, else `the worker failed (exit N)`; never its summary, result
  summary, stdout or stderr. Successful workers, asks, `models`,
  `stopReason`, `modelFallback`, `injection` unchanged.
- REQ-agent-118 (modified): a failed voice or chair run is quoted in the
  transcript by that line.
- REQ-watch-009 (modified): `watchPublicFailureLine` is the shared
  `withoutProviderHost`; behaviour unchanged.
- No hi criterion is added or changed; no env var, config key, flag, protocol
  field or new surface.
