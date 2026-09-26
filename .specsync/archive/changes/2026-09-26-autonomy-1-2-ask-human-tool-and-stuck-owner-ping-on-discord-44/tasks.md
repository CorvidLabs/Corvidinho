---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: tasks
---

# Tasks

- [x] Agent types: `blocked` state, `HumanAsk`, optional `ask` on results
- [x] `src/agent/ask.ts` + tool-loop intercept and system prompt rule
- [x] runTask blocked result and stuck ask on verify exhaustion; NDJSON state label
- [x] `src/discord/ask-ping.ts`; spawn client, gateway `mentionUserIds`, bridge and scheduler hooks
- [x] Fixture tests `tests/agent.ask.test.ts`, `tests/discord.ask-ping.test.ts`
- [x] Docs, spec files lists, deltas REQ-agent-044 / REQ-discord-044
- [x] specsync check, tsc, bun test, `fledge lanes run verify --non-interactive`
- [x] Schedule owner ping once per question: schema v7 `schedules.ask_ping_key`, `askPingKey`, `ScheduleStore.setAskPingKey`, dedupe tests
- [x] `/work` PR step skips a blocked run (`needs-input`) after merging #166
