---
module: cli
change: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
---

# Delta — cli (task run leaves a signal it started with ignored alone)

## Modified

### REQUIREMENT REQ-cli-244

`corvidinho task run` SHALL pass an AbortSignal to `runTask` and SHALL abort
it on the first SIGINT or SIGTERM (AGENT-3). The run's verify lane and tool
loop SHALL stop (REQ-agent-244), the structured cancelled result SHALL still
be printed in the selected output mode (text line, `--json` document, or a
final ndjson `result` frame with `cancelled: true`), and the process SHALL
exit 130 instead of dying by the signal. The handlers SHALL be removed when
the run ends; a second signal SHALL take its default action. A SIGINT or
SIGTERM this process started with ignored (a background job's SIGINT) SHALL
NOT be hooked and SHALL stay ignored, as for the process-tree hook
(REQ-plugins-154). No flag or environment variable is added.

Acceptance Criteria
- `task run --task demo --output ndjson` with a fake `fledge` on PATH (it starts a lane task and blocks), sent SIGINT or SIGTERM while verify runs, exits 130 (not by the signal), its last stdout line is a `result` frame with `cancelled: true`, `verified: false`, `state: "failed"`, and both the fake `fledge` and its lane task are gone.
- The same run started with SIGINT ignored (`sh -c 'trap "" INT; exec …'`) is still running, with its lane, 1 s after a SIGINT; a SIGTERM then exits 130 with a cancelled `result` frame and stops the lane.
