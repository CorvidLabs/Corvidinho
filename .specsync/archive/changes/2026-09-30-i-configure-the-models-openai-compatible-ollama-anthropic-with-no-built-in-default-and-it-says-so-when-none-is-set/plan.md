---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: plan
---

# Plan

1. No `hi` capture: AGENT-13 and AGENT-10 are already on main.
2. `src/agent/providers.ts`; `tier.ts` over it (no `DEFAULT_LLM_MODEL`);
   `loadLlmEnv` with `kind` / `notice`; `createTaskExecute` fails with the
   notice; `chatCompletions` sends auth only with a key; delete the stub.
3. Notice surfaces: bridge startup, WATCH startup, daemon `llm` field and
   `llm.no_provider`, `task run` stderr, `/status` (owner / others), doctor
   and init.
4. Spend snapshot ignores an unset model; `ANTHROPIC_API_KEY` in SAFE-6.
5. Tests: `tests/agent.providers.test.ts`; move stub / default-model tests to
   a fake provider (`tests/fixtures/fake-llm.ts`); preload hygiene.
6. Fail-on-base proof: swap the base's 13 modified source files in (the new
   module kept), run the new and changed tests, restore, run again.
7. Docs (.env.example, README, AGENTS.md command comment, docs/DAEMON.md,
   docs/DISCORD-GO-LIVE.md E.4 / E.9 and env block, docs/discord.md), spec
   prose, deltas and testing evidence.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
