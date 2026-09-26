---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: design
---

# Design

Scrub at the two WATCH sinks, and scrub before clipping at each one:

1. `buildSummaryBody` (public thread comment):
   `scrubSecrets(spawn.summary || "").trim().slice(0, 1200)`. This covers every
   caller of `maybePostWatchSummary`, whatever produced the summary.
2. Poller spawn outcome (durable JSONL):
   `summaryPreview: scrubSecrets(spawnSummary).slice(0, 240)`.

A secret becomes `[redacted:<kind>]`. Text with no secret is unchanged
(`scrubSecrets` is idempotent and leaves ordinary text alone), so the ack,
dedup, once-per-event and status line behaviour do not change. No new public
API, env var or command. There is no schema change: the JSONL field keeps the
same name and type.
