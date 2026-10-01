---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: docs
---

# Docs

- `specs/agent/agent.spec.md`: Public API names `workerFailureLine`,
  `WORKER_TIMED_OUT_LINE`, `WORKER_INTERRUPTED_LINE` and
  `withoutProviderHost`; an invariant for the failed-worker line; a
  scenario (a delegated worker's model call fails); an error-case row; the
  new test file in `files`.
- `specs/agent/testing.md`: a section for the new tests and the
  fail-on-main proof.
- `specs/watch/watch.spec.md`: `watchPublicFailureLine` is the shared
  `withoutProviderHost`.
- No user doc changes: the tool result is model-facing, and no owner-visible
  text, setting or command changes (`docs/discord.md` / `docs/WATCH.md`
  already describe failed runs' one-line reasons).
