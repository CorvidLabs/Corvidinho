---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: plan
---

# Plan

1. Write the regression tests first and confirm they fail on the base
   commit:
   - `tests/agent.cli.test.ts`: SIGINT and SIGTERM during verify (fake
     `fledge` with a lane task) must exit 130, print a cancelled `result`
     frame, and leave no fledge or lane task behind.
   - `tests/agent.execute.test.ts`: a trickling provider (read tier) and a
     silent provider (tool tier) must time out; a caller abort must not be
     reported as a timeout.
   - `tests/agent.loop.test.ts`: an abort during verify with `maxRetries: 0`
     must give a cancelled result, with no `VerifyResult` and no `ask`.
2. Wire SIGINT and SIGTERM to an AbortController in `taskRun` and pass
   `signal` to `runTask`.
3. Check the signal after the verify runner returns in `runTask`.
4. Run the default verify runner in its own process group and kill its
   tree on abort (proc-group helpers).
5. Bound each chat completions request with `AbortSignal.any([caller,
   timeout])`, report `LLM request timed out after <ms>ms`, and add
   `LLM_REQUEST_TIMEOUT_MS` / `llmTimeoutMs`.
6. Deltas: Added REQ-agent-244 and REQ-cli-244. Update the agent and cli
   spec Public API, Invariants and Error Cases.
7. Run `specsync check`, `bunx tsc --noEmit`, `bun test` and
   `fledge lanes run verify --non-interactive`.
