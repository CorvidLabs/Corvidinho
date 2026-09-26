---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: research
---

# Research

- `src/agent/task-summary.ts`: `chatBodyFromTaskResult` does
  `summary.trim().slice(0, 1800)`; `summarizeTaskRunOutput` and
  `chatBodyFromTaskRunOutput` do `stdout.trim().slice(0, 1800)` and
  `stderr.trim().slice(0, 500)`. None of them scrubs.
- `collectTaskRunStream` (`src/agent/events-ndjson.ts`) builds the summary
  from these helpers for WATCH (`src/watch/agent-client.ts`), Discord
  (`src/discord/agent-client.ts`) and delegate workers
  (`src/autonomous/delegate.ts`, which scrubs after the helpers have clipped).
- `resultFrame` caps `result.summary` at `NDJSON_LIMITS.resultSummary`
  (4000) with a raw `slice` in the child process, before any reader sees it.
  `capHead` in the same module already scrubs before it clips.
- `scrubSecrets` vendor-token patterns need a minimum length (for example 20
  chars after `ghp_`), and the `private-key` pattern needs the
  `-----END … PRIVATE KEY-----` line. A clip inside either one defeats the
  scrub.
- The `private-key` body stops at the next `-----BEGIN ` so the scrub stays
  linear on hostile input (REQ-discord-066). Adding end-of-text and next-BEGIN
  terminators keeps that property: once a header matches, the match always
  succeeds, so no attempt fails after rescanning the rest of the input.
- `SCRUB_RULES_VERSION` must be bumped when the patterns tighten, so rows
  already in the shared DB are re-scrubbed once on the next open.
- `plugins/github/review.ts` `boundForScrub` already drops a private-key block
  left open by its hard cut. It still works with the wider pattern.
