---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: docs
---

# Docs

- `docs/WATCH.md` (Reliability, WATCH-RELIABILITY-3): the backoff covers the
  poll fetch, the auto-ack and the run-summary comment; for a comment the
  backoff line follows its `ack failed` / `summary failed` line; a plain 403
  on a comment only logs the failure; a failed ack or summary is not retried.
- `specs/watch/watch.spec.md`: Public API note (`AckCommentResult`
  `status` / `headers`, `onPostFailed`), Invariants and Behavioral
  Examples.
- `specs/watch/requirements.md`: REQ-watch-011 text and acceptance.
- `specs/watch/testing.md`: coverage note for the new tests.
