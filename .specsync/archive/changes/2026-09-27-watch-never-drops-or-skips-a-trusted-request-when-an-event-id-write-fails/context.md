---
change: watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails
artifact: context
---

# Context

Adversarial review of PR #195 (watch-github-3, REQ-watch-247) found two gaps
in its failure handling for the new DB-backed event-id stores:

- The per-event catch re-ran `processed.addMany` whenever the event was not
  yet marked, including when the id write itself had just failed. If the lock
  cleared a moment later, the retry succeeded, the event was logged
  "marked processed" and never ran or retried: a trusted request was lost,
  against REQ-watch-247's own acceptance criterion ("the next cycle handles it
  once").
- `maybePostWatchAck` writes the acked id after posting the ack comment. With
  a DB store that write can now throw (e.g. SQLITE_BUSY past the 5 s busy
  timeout). The throw left the per-event try, so the agent run was skipped for
  a request that had already been told "on it", and the processed mark kept it
  from ever running. `maybePostWatchSummary` had the same shape (after the
  summary comment; nothing else was skipped there, but the error was thrown).

HI / rules: REQ-watch-247, REQ-watch-037 (one failing event never aborts the
cycle), REQ-watch-009 / WATCH-RELIABILITY-1 (summary once after a successful
ack), ALLOW-1 unchanged.

Constraints: no schema change, no new env vars, CLI flags or slash commands.
Routing failures (before the id write) keep REQ-watch-037's "marked processed"
behaviour so a deterministic router error is not retried forever.
