---
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
artifact: plan
---

# Plan

1. `src/agent/shell-gate.ts`: surface constants, `isOwnTalkWorktree`, `shellToolsGate`, the refusal line.
2. `src/agent/tools.ts`: rename to `SAFE3A_TOOLS`; `allowlistOffers(…, safe3a)`, `BuildToolsOpts.safe3a`.
3. `src/agent/execute.ts` (`createTaskExecute` only): per-attempt gate → `buildOpenAiTools({ safe3a })`, one Text line per run.
4. Stamps: `src/discord/agent-client.ts` (`surface`), `src/watch/agent-client.ts` (`watch`), `src/discord/bridge.ts` (chat, ask), `src/discord/command-handlers/{session,work}.ts`, `src/scheduler/service.ts`.
5. Tests: `tests/agent.safe3a-gate.test.ts` (matrix, catalog), `tests/agent.safe3a-owner-shell.test.ts` (end to end incl. the must-ask card), `tests/discord.safe3a-surface.test.ts` (stamps); `tests/agent.allowlisted-dangerous.test.ts` renamed set.
6. Fail-on-base proof: swap the base's eight sources in (gate module removed), run, restore.
7. Docs (`docs/DISCORD-GO-LIVE.md`, `docs/discord.md`, `STATUS.md`), spec prose (agent, discord, watch), deltas, testing evidence.
8. `specsync change approve` → `specsync change check --commit` → `specsync change audit` → `specsync check --require-coverage 100` → `hi check` → `bunx tsc --noEmit` → `bun test` → `fledge lanes run verify --non-interactive`.
