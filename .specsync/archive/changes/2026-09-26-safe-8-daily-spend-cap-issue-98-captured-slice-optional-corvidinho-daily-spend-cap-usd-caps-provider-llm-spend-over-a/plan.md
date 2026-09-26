---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: plan
---

# Plan

1. `src/agent/spend.ts`: cap parsing, price table, integer micro-USD cost and
   estimate, spend_ledger + SpendLedger (IMMEDIATE reserve, settle, window),
   `withSpendCap`, `spendDoctorCheck`.
2. One-line hook in `createTaskExecute`; doctor line + help env line in
   `src/cli.ts`; `SCRUB_TARGETS` entry; index re-exports; `.env.example`.
3. Fixture tests (`tests/agent.spend.test.ts`), mocked fetch only.
4. Deltas REQ-agent-098 / REQ-cli-098 / REQ-discord-098; spec file lists.
5. tsc, bun test, specsync check, change check, audit, fledge verify.
