---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: plan
---

# Plan

1. Capture SESSION-5.a with `hi` (own commit).
2. `providers.ts`: `=TOKENS` on entries. `conversation.ts`: no ceiling,
   `fixedChars`, model-line-safe `appendSummary`, replay / report types and
   validation.
3. `src/agent/condense.ts`: window, stdin payload, summary prompt / line,
   condenser. `execute.ts`: build the condenser, hook tool loop and read
   tier. `types.ts`: `TaskResult.conversation`. `cli.ts`: `--task-stdin`,
   report on the result, help.
4. Bridges: `SessionStore.threadPrompt` (no fold), `replayFor`,
   `applyCondensed`; bridge chat + ask pass the replay and keep the report;
   Discord / WATCH spawn clients send stdin and validate the report; WATCH
   poller passes the replay and saves the report.
5. Tests with the fake LLM (`tests/agent.condense.test.ts`) and updated
   bridge / store tests; fail-on-base proof.
6. Specs (agent / cli / discord / watch), deltas, docs, STATUS, CHANGELOG.
7. `specsync change approve` / `check --commit` / `audit`, `specsync check
   --require-coverage 100`, `hi check`, `tsc`, `bun test`, verify lane.
