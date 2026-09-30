---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: plan
---

# Plan

1. `src/agent/ask.ts`: `mustAskRefusedAsk(tool, result)`.
2. `src/agent/execute.ts`: no Fledge discovery in a scheduled run; end a
   scheduled run on a must-ask no with that ask.
3. `src/plugins/roles.ts`: a scheduled run is never team.
4. `src/scheduler/service.ts`: `loadOwner`, `liveOwner()`, the owner stamp
   only for the live owner's own schedule; doc comments.
5. `src/discord/bridge.ts`, `src/daemon/daemon.ts`: wire `loadOwner`;
   `src/discord/agent-client.ts` doc.
6. Tests: `tests/scheduler.owner-role.test.ts` (new), schedule-run stamps in
   `tests/roles.team.test.ts` and `tests/agent.allowlisted-dangerous.test.ts`.
7. Fail-on-base proof: swap the base's sources in, run, restore.
8. Docs (`docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`),
   spec prose (discord, plugins, agent, cli) and module testing notes;
   deltas and requirement evidence.
9. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
