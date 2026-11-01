---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: tasks
---

# Tasks

- [x] `src/agent/spend.ts`: `holdOnCard` / `passOnCard`, `waitOnCard(cardDb, …)`, `FlatSpendCard`, `FlatSpendCardOutcome`, `SpendGuard.flatCard`, `spendCardFields({ tool })`, async `reserveFlatSpend({ tool, card?, signal? })`.
- [x] `src/plugins/types.ts` / `src/plugins/run.ts`: `spendCard` on `PluginHandlerArgs` / `RunOptions`, passed to the handler.
- [x] `src/agent/execute.ts`: the tool loop hands `spend.flatCard` to `runPlugin`.
- [x] `plugins/web/search.ts`, `plugins/web/commands.ts`, `plugins/gif/giphy.ts`, `plugins/gif/commands.ts`: `ctx.spendCard` and the run's signal reach `reserveFlatSpend`.
- [x] Tests: `tests/agent.spend-approve.test.ts` (7), `tests/web.search.test.ts` (3), `tests/gif.search.test.ts` (1); fail-on-main proof in testing.md.
- [x] Docs: `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`.
- [x] Spec prose (agent, plugins), module testing evidence, deltas (REQ-agent-398 / REQ-plugins-398 added; REQ-agent-098 modified).
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
