---
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
artifact: research
---

# Research

- GitHub primary rate-limit: `x-ratelimit-remaining: 0` + `x-ratelimit-reset` (unix seconds).
- Secondary / abuse: often 403 with `Retry-After` (seconds).
- Documented default backoff: 60s when headers absent (matches poll interval floor).
- Durable store: JSONL under shared data dir (same pattern as MEMORY path resolution) —
  avoids schema migration; ops can `tail` without Discord.
- Tip package already 0.0.9 (#137); open #140 also claims 0.0.9 → ship as **0.0.10**.
