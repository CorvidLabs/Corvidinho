---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: requirements
---

# Requirements

HI: AGENT-3 ("when I interrupt it, it actually stops instead of finishing in
the background"). Existing REQ-agent-003 ("Cancellation via AbortSignal
SHALL abort promptly"; "Aborted signal during/before verify returns
`cancelled=true`") was not met by the CLI.

- REQ-cli-244 (added): `task run` aborts its run on the first SIGINT or
  SIGTERM, still prints the cancelled result in the selected output mode
  (ndjson `result` frame included) and exits 130. It removes its handlers
  when the run ends. No flag or env var is added.
- REQ-agent-244 (added): the default verify runner runs in its own process
  group and an abort stops its whole tree, and an already-aborted signal
  does not start the lane. `runTask` returns the cancelled result when the
  abort fired while verify ran, with no `VerifyResult`, no retry and no
  `stuck` ask. Each chat completions request (headers and body) is bounded
  by `LLM_REQUEST_TIMEOUT_MS` (10 min; `llmTimeoutMs` option) and reports
  `LLM request timed out after <ms>ms`. A caller abort is not reported as
  a timeout.

Unchanged: REQ-agent-002 retry semantics for a real verify failure,
REQ-agent-008 tool loop gates, REQ-agent-073 / REQ-cli-073 NDJSON frames
(protocol 2), REQ-plugins-154 proc-group behavior (reused, not changed).
