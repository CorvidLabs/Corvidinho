---
id: task-run-leaves-a-sigint-it-started-with-ignored-alone-and-an-interrupted-verify-lane-stops-waiting-on-a-pipe-an
state: archived
type: bug_fix
base_commit: 4dccb453fe3170cb77327622916a232d2294d6dc
---

# Task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up)

## Intent

task run leaves a SIGINT it started with ignored alone, and an interrupted verify lane stops waiting on a pipe an escaped lane process holds (agent-loop-4 follow-up)

## Affected Canonical Specs

- `cli`
- `agent`

## Acceptance Criteria

- A task run started with SIGINT ignored (a background job of a non-interactive shell) keeps SIGINT ignored: a SIGINT leaves the run and its verify lane running, while SIGTERM still cancels it (exit 130, final ndjson result frame with cancelled=true); SIGINT/SIGTERM that were not ignored at start still abort the run as before; after an abort the default verify runner waits at most a short grace (250 ms) for the lane's output pipes, so a lane process that escaped the tree kill and still holds a pipe no longer keeps the interrupted run from exiting; no new env vars, flags or slash commands; fixture CLI tests prove both regressions

## No-spec Rationale

Not applicable
