---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: plan
---

# Plan

1. Confirm AGENT-11 is captured on main (`hi/agent.md`) and #80 is the
   tracking issue; capture nothing new.
2. `src/agent/providers.ts`: chain, failure reasons, note / log / label
   helpers, child-result validators.
3. `src/agent/execute.ts`: failure classification in `chatCompletions`,
   `callModels`, the chain in `createTaskExecute`, worker hops, the note.
4. Types, NDJSON usage frame fields, closing-note clips, `task run` result.
5. Delegate / council outcomes and plugin data.
6. Discord spawn client, footer model and per-model price; WATCH client and
   daemon `llm.fallback` lines.
7. `tests/agent.fallback.test.ts`; fail-on-base proof (swap the base's
   sources in, keeping `providers.ts` / `types.ts` so imports resolve).
8. Docs, spec prose, deltas and module testing evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
