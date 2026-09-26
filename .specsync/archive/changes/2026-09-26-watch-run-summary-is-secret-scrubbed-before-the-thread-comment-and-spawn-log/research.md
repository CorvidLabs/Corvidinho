---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: research
---

# Research

- `src/watch/summary.ts` `buildSummaryBody`: `(spawn.summary || "").trim().slice(0, 1200)` goes into the comment body with no scrub.
- `src/watch/poller.ts`: `summaryPreview: spawnSummary.slice(0, 240)` then goes to `SpawnOutcomeStore.append` (`appendFileSync` in `src/watch/spawn-log.ts`).
- `spawnSummary` comes from `AgentClient.runChat` (`collectTaskRunStream`: result frame, else `chatBodyFromTaskRunOutput` with a raw stderr fallback) or from a thrown error's message in the poller's catch.
- `AgentClient` can be injected (`startWatchPoller({ agent })`), so scrubbing only inside `createSpawnAgentClient` would miss injected clients and the thrown-error path. Scrubbing at the two WATCH sinks covers every source.
- `scrubSecrets` patterns need 20+ token chars after the prefix (e.g. `ghp_`). Clipping before scrubbing can cut a token to a short prefix the scrubber no longer matches, and that prefix leaks. `events-ndjson.ts` `capHead` already scrubs before it clips for the same reason.
- The formatted spawn outcome log line (`formatSpawnOutcomeLog`) does not include the summary.
