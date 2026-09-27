---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: tasks
---

# Tasks

- [x] Regression tests fail before the fix. SIGINT/SIGTERM `task run` died by the signal with no `result` frame. The stalled provider tests hung until bun's 5s timeout. Abort-during-verify with `maxRetries: 0` gave `cancelled=false`.
- [x] `taskRun` aborts on SIGINT/SIGTERM and passes `signal` to `runTask`; the handlers are removed afterwards.
- [x] `runTask` returns the cancelled result when the abort fired while verify ran.
- [x] The default verify runner runs in its own process group; an abort kills the lane's whole tree.
- [x] `chatCompletions` bounds headers and body with a per-request timeout (`LLM_REQUEST_TIMEOUT_MS`, `llmTimeoutMs`); a caller abort is not reported as a timeout.
- [x] Regression tests pass after the fix; the existing agent, tool-loop and CLI tests still pass.
- [x] Deltas: Added REQ-agent-244 and REQ-cli-244; agent and cli spec Public API, Invariants and Error Cases updated.
