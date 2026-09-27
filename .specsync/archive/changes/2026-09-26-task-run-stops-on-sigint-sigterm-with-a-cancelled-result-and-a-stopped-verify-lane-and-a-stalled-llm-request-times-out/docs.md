---
change: task-run-stops-on-sigint-sigterm-with-a-cancelled-result-and-a-stopped-verify-lane-and-a-stalled-llm-request-times-out
artifact: docs
---

# Docs

- Inline comments explain the design: the signal wiring in `taskRun`
  (`src/cli.ts`); why the verify lane runs in its own process group
  (`src/agent/verify.ts`); the post-verify abort check (`src/agent/loop.ts`);
  and `LLM_REQUEST_TIMEOUT_MS` / `llmTimeoutMs` (`src/agent/execute.ts`).
- `specs/agent/agent.spec.md` gets updates to Public API
  (`LLM_REQUEST_TIMEOUT_MS`, `llmTimeoutMs`), Invariants and Error Cases (LLM
  request stalls; abort while verify runs). `specs/cli/cli.spec.md` gets an
  Error Cases row for an interrupted `task run` (exit 130, cancelled result).
- No README, CHANGELOG, STATUS or package version change; release PRs own
  those. No operator doc change, since no env var or flag was added.
