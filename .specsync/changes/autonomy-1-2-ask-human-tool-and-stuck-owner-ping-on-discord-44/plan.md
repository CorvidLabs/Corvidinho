---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: plan
---

# Plan

1. Add `HumanAsk`, `blocked` state and optional `ask` to agent types.
2. New `src/agent/ask.ts`: tool def, argument parsing, summaries, stuck ask.
3. Small hooks: tool loop intercept + system prompt rule (`execute.ts`),
   blocked / stuck results (`loop.ts`), NDJSON state set + label.
4. New `src/discord/ask-ping.ts`; thread `ask` through the spawn client and
   `AgentSpawnResult`; `mentionUserIds` on gateway reply; bridge and
   scheduler hooks.
5. Fixture tests (`tests/agent.ask.test.ts`, `tests/discord.ask-ping.test.ts`),
   docs, spec files lists, deltas REQ-agent-044 / REQ-discord-044.
6. specsync check, tsc, bun test, fledge verify.
