---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: plan
---

# Plan

1. `src/agent/spend.ts`: `holdOnCard` (non-throwing core of `passOnCard`),
   `waitOnCard(cardDb, …)`, `FlatSpendCard` / `FlatSpendCardOutcome`,
   `SpendGuard.flatCard`, `spendCardFields({ tool })`, async
   `reserveFlatSpend({ tool, card?, signal? })`.
2. `src/plugins/types.ts`, `src/plugins/run.ts`: `spendCard` pass-through.
3. `src/agent/execute.ts`: hand `spend.flatCard` to the tool loop and
   `runPlugin`.
4. `plugins/web/*`, `plugins/gif/*`: pass `ctx.spendCard` and the signal.
5. Tests in `tests/agent.spend-approve.test.ts`, `tests/web.search.test.ts`,
   `tests/gif.search.test.ts`; swap main's sources in to prove they fail;
   restore.
6. Docs, spec prose, module testing evidence, deltas.
7. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
