---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: design
---

# Design

- `src/watch/summary.ts`: `watchPublicFailureLine(reason)` matches the
  `modelCallFailedLine` shapes — `The model call failed|timed out (` … `)`
  ending in `from <host>`, `reaching <host>` or a bare `(<host>)`, or in a
  host the 200-char cap cut (`…`) — and returns the line without the host
  (`The model call failed (429 Too Many Requests)`, `The model call timed
  out`, `… (network error)`, `… (malformed reply)`, `The model call failed`).
  A host has no spaces, so the no-key line (`(<model> needs <ENV>, which is
  not set)`) never matches; every other reason is returned as is.
- `buildSummaryBody` posts `watchPublicFailureLine(watchFailureReason(…))`
  for a failed run without an ask; nothing else in the body changes.
- `src/watch/poller.ts`: the `[watch] run failed …` log line keeps the full
  reason (with the host) for the owner; the kept agent turn is the public
  line, since a kept turn is replayed to the model and a later public comment
  could repeat it.
- Not changed: `watchFailureReason`, `failureReasonFor`, Discord surfaces,
  the result frame, successful runs, asks, spend-cap stops, the spawn JSONL.
