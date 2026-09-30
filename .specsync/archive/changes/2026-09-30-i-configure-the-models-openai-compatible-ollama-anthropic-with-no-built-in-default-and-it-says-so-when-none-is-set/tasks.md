---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: tasks
---

# Tasks

- [x] `src/agent/providers.ts`: entries, kinds, endpoints and keys, `providerId`, the no-provider notice and status helpers.
- [x] `tier.ts` without `DEFAULT_LLM_MODEL`; `loadLlmEnv` returns the tier's provider and notice; the attempt fails with the notice and calls nothing; no demo stub; no auth header without a key.
- [x] Startup notice: bridge, WATCH (not in a dry run), daemon (`llm` field, `llm.no_provider`), `task run` stderr; `/status` owner vs others; doctor / init `[warn] llm`.
- [x] Spend snapshot: an unset model is not unpriced; `ANTHROPIC_API_KEY` is a SAFE-6 secret env name.
- [x] `tests/agent.providers.test.ts`; stub / default-model tests moved to a fake provider; `tests/preload.ts` clears model config and provider keys.
- [x] Fail-on-base proof recorded in testing.md.
- [x] Docs, spec prose, deltas and module testing evidence updated.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
