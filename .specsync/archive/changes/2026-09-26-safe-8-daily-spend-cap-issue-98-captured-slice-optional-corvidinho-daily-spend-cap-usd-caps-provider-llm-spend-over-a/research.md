---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: research
---

# Research

- Issue #98 "steal from": Merlin `crates/merlin-core/src/spend.rs` (rolling
  caps, pricing catalogue with unknown-cost handling) and corvid-agent
  `server/providers/cost-table.ts` / `server/db/spending.ts` (price table +
  ledger). Taken: per-model price table, per-call ledger, unknown price never
  free. Not taken: per-provider caps, warnings, approval cards (draft HI).
- The only provider call path is `chatCompletions` in `src/agent/execute.ts`,
  reached through `createTaskExecute`'s fetch; CLI, Discord and WATCH runs all
  go through `task run`, so one fetch wrapper covers every surface. Usage
  parsing reuses `extractUsage` (REQ-agent-073).
- Anthropic list prices from the bundled Claude API reference (cached
  2026-06-24); OpenAI list prices for the listed ids. Prices per model id only
  move down over time, so listed ids err high.
- bun:sqlite supports `transaction(fn).immediate()` (BEGIN IMMEDIATE), which
  serializes the check-and-reserve across processes sharing the DB file
  (busy_timeout 5000 is already set on the shared DB).
