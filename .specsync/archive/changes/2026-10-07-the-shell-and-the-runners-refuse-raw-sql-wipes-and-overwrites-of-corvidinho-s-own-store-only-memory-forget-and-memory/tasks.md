---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: tasks
---

# Tasks

- [x] Confirm SAFE-4 is captured on main (`hi/safe.md`); nothing new to capture; `hi check` passes.
- [x] `plugins/shell/store-guard.ts`: `firstStoreHit`, `storeRefuseMessage`, `storeRefusal`, `runnerStoreHit`, `runnerStoreRefusal`, `STORE_INSTEAD` over `forEachSimpleCommand` / `commandChain`; `globMatches` exported from footguns.ts unchanged.
- [x] `plugins/shell/commands.ts`: SAFE-4 refusal after SAFE-21, before the clamp; description updated.
- [x] `plugins/runners/commands.ts`: `runRunner` refuses argv naming the store before the spawn.
- [x] `plugins/shell/must-ask.ts`: `shellProdWhy` / `runnerProdWhy` skip a call the guard refuses.
- [x] `tests/shell.store-guard.test.ts` (11 tests); fail-on-base proof recorded in testing.md.
- [x] docs/DISCORD-GO-LIVE.md, docs/discord.md, spec prose, delta and module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
