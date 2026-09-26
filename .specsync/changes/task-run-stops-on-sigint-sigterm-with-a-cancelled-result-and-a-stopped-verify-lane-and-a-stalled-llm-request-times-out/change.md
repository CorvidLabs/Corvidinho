---
id: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
state: draft
type: bug_fix
base_commit: 2ff0598784b5e7c72f2c0eedbb85131324e7e239
---

# Task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4)

## Intent

task run stops on SIGINT/SIGTERM with a cancelled result and a stopped verify lane, and a stalled LLM request times out (agent-loop-4)

## Affected Canonical Specs

- `cli`
- `agent`

## Acceptance Criteria

- SIGINT or SIGTERM to a running task run aborts the run: the verify lane (fledge and its tasks, own process group) and the tool loop stop, the structured cancelled result is still printed (a final ndjson result frame with cancelled=true under --output ndjson) and the process exits 130 instead of dying by the signal; an abort while the verify lane runs yields cancelled=true even when no retries remain (no VerifyResult failure, no retry, no stuck ask); each OpenAI-compatible chat completions request (waiting for headers and reading the body) is bounded by a per-request timeout (default 10 minutes) so a stalled provider returns an LLM request timed out error instead of hanging task run and the Discord/watch runs that await it; a caller abort still stops the request and is not reported as a timeout; no new env vars, flags or slash commands; fixture tests prove each regression with no network

## No-spec Rationale

Not applicable
