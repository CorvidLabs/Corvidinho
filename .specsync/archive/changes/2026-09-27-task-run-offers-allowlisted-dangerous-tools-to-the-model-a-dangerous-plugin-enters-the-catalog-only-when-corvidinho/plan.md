---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: plan
---

# Plan

1. Write regression tests (tests/agent.allowlisted-dangerous.test.ts) and watch
   them fail with main's src/agent sources.
2. `src/agent/tools.ts`: `SAFE3_PENDING_TOOLS`, `allowlistOffers`,
   `editsFilesUnreported`, `BuildToolsOpts.allowlist` and the catalog filter.
3. `src/agent/execute.ts`: pass the run's allowlist to `buildOpenAiTools`, load
   Fledge plugins when the allowlist names a `fledge-*` command, record
   `unreportedEditTools` in the tool loop.
4. `src/agent/types.ts` / `src/agent/loop.ts`: `ExecuteResult.unreportedEditTools`
   and the non-git fail-closed branch of the verify gate.
5. Update the REQ-agent-128 test, specs (requirements, agent.spec.md,
   testing.md), deltas and the operator docs the change makes false.
6. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
