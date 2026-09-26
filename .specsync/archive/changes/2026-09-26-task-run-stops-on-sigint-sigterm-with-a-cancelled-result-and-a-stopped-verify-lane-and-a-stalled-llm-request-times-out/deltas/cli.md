---
module: cli
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
---

# Delta — cli (task run handles SIGINT / SIGTERM; agent-loop-4)

## Added

### REQUIREMENT REQ-cli-244

`corvidinho task run` SHALL pass an AbortSignal to `runTask` and SHALL abort
it on the first SIGINT or SIGTERM (AGENT-3). The run's verify lane and tool
loop SHALL stop (REQ-agent-244), the structured cancelled result SHALL still
be printed in the selected output mode (text line, `--json` document, or a
final ndjson `result` frame with `cancelled: true`), and the process SHALL
exit 130 instead of dying by the signal. The handlers SHALL be removed when
the run ends; a second signal SHALL take its default action. No flag or
environment variable is added.

Acceptance Criteria
- `task run --task demo --output ndjson` with a fake `fledge` on PATH (it starts a lane task and blocks), sent SIGINT or SIGTERM while verify runs, exits 130 (not by the signal), its last stdout line is a `result` frame with `cancelled: true`, `verified: false`, `state: "failed"`, and both the fake `fledge` and its lane task are gone.
