---
module: watch
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
---

# Delta — watch (spawn client on the event stream, issue #73)

## Added

### REQUIREMENT REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --no-verify --task <prompt> --output ndjson`, read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv ends with `--output ndjson` (no `--json`).
