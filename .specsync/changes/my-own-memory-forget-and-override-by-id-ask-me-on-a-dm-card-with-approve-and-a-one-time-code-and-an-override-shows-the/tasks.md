---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: tasks
---

# Tasks

- [x] Read the interview record (round 17) and SAFE-18/19/20, SAFE-4/5 on main; capture SAFE-18.a with `hi` in its own commit; `hi check` passes.
- [x] `src/memory/card.ts`: `memoryCardFields`, `askMemoryCard`, `setMemoryCardTestHooks`, `MEMORY_CARD_*`; `src/memory/index.ts` exports; `src/memory/confirm.ts` removed.
- [x] `plugins/memory/commands.ts`: `ownerCard` (bridge / conversation checks, `--confirm` refused, card + wait, owner re-check, unchanged-row transaction), descriptions.
- [x] `src/discord/approval-cards.ts` `memoryApprovalKind`; `src/discord/bridge.ts` registers it; `src/discord/agent-client.ts` clears the token env; `src/agent/tools.ts` hint.
- [x] `tests/memory.forget-card.test.ts` (16), `tests/memory.plugins.test.ts`, `tests/memory.spawn-env.test.ts`, `tests/discord.session-thread.test.ts`; `tests/memory.confirm.test.ts` removed.
- [x] Fail-on-base proof recorded in testing.md (base sources swapped in, run, restored).
- [x] Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`), spec prose and files lists (plugins, discord), module testing evidence (plugins, discord, agent), deltas.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
