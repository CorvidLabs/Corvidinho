---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: docs
---

# Docs

- `docs/WATCH.md` (Run summary bullet): the example line is now `The model
  call failed (429 Too Many Requests)`; the bullet says a model-call line
  loses the provider's host on the thread (`watchPublicFailureLine`) and why,
  that the `[watch] run failed` log line keeps the host, and that the kept
  turn is the comment's line.
- `specs/watch/watch.spec.md`: the public API paragraph names
  `watchPublicFailureLine`; the invariant and the behavioral example say the
  comment names the status, never the host, and the log keeps it.
- `specs/watch/testing.md`: a section for the host cases and their
  fail-before proof; the earlier end-to-end bullet now matches.
