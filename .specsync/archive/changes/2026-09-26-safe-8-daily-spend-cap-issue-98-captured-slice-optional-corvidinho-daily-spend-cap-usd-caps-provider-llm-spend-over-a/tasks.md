---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: tasks
---

# Tasks

- [x] Deltas REQ-agent-098 / REQ-cli-098 / REQ-discord-098
- [x] src/agent/spend.ts (cap parse, price table, micro-USD cost/estimate, ledger, capped fetch, doctor line)
- [x] createTaskExecute wraps its fetch with withSpendCap
- [x] doctor spend line + help env line in src/cli.ts; .env.example note
- [x] SCRUB_TARGETS gains spend_ledger provider/model
- [x] Fixture tests in tests/agent.spend.test.ts (mocked fetch, no network)
- [x] Spec files lists updated
- [x] tsc / bun test / specsync check / change check / audit / fledge verify green
