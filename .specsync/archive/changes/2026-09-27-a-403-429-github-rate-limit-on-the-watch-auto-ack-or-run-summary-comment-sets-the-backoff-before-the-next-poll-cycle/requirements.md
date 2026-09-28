---
change: a-403-429-github-rate-limit-on-the-watch-auto-ack-or-run-summary-comment-sets-the-backoff-before-the-next-poll-cycle
artifact: requirements
---

# Requirements

Modifies **REQ-watch-011** (GitHub 403/429 rate-limit backoff): the backoff
covers the auto-ack and the run-summary comment as well as the poll fetch; a
failed comment post keeps its status and rate-limit headers; a plain 403 on a
comment sets no backoff; WATCH-RELIABILITY-1 is unchanged. See
`deltas/watch.md`.

Source HI: WATCH-RELIABILITY-3 (captured, `hi/watch.md`). Not added: an env
var, config key, CLI or slash command, or aborting the rest of a cycle.
