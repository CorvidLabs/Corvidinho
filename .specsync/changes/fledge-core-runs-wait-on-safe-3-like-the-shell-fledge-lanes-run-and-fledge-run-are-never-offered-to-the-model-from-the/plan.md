---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: plan
---

# Plan

1. Add the two core runs to `SAFE3_PENDING_TOOLS` (`src/agent/tools.ts`).
2. Make `allowsFledge` skip the core builtin names (`src/agent/execute.ts`).
3. Tests: extend the SAFE-3 pending catalog test, and add a task-run test
   that allowlists all four core builtins; prove both fail without the fix.
4. Update REQ-agent-501 / REQ-agent-112 (delta), the agent spec prose and
   error row, and `docs/DISCORD-GO-LIVE.md`.
5. Run tsc, `bun test`, `specsync check --require-coverage 100` and the
   verify lane.
