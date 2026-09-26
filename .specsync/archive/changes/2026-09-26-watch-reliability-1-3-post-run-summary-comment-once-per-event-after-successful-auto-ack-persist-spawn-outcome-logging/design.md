---
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
artifact: design
---

# Design

- **Summary (RELIABILITY-1):** `src/watch/summary.ts` — `SuccessfulAckStore` records
  event ids whose auto-ack `posted===true`; after `agent.runChat` finishes,
  `maybePostWatchSummary` posts via the same injectable `AckClient`, gated by
  successful ack + `SummarizedIdStore` once-per-id. Reuses Made with Corvidinho footer.
- **Spawn log (RELIABILITY-2):** `src/watch/spawn-log.ts` — structured start/outcome
  lines; `SpawnOutcomeStore` appends JSONL under `resolveDataDir()/watch-spawn.jsonl`
  (or `CORVIDINHO_WATCH_SPAWN_LOG`). Error classes: `ok` | `exit_nonzero` | `spawn_throw`.
- **Backoff (RELIABILITY-3):** `src/watch/rate-limit.ts` — parse 403/429 + headers;
  `GithubRateLimitError`; poller tracks `backoffUntilMs`, skips fetch while hot,
  reschedules via `setTimeout` with `max(interval, remaining backoff)`. Octokit
  search client rethrows rate-limit via `asGithubRateLimitError`.
- **HI:** live `hi/watch.md`; draft pointer `docs/hi-drafts/WATCH-RELIABILITY.md` marked captured.
- Package **0.0.10**. No webhook / allowlist / ProcessManager changes.
