---
change: the-shell-and-the-runners-refuse-raw-sql-wipes-and-overwrites-of-corvidinho-s-own-store-only-memory-forget-and-memory
artifact: plan
---

# Plan

1. Confirm SAFE-4 is captured on main; nothing to capture; `hi check`.
2. Add `plugins/shell/store-guard.ts` (store resolution, naming and
   fail-closed checks, shell and runner refusals); export `globMatches`
   from footguns.ts unchanged.
3. Wire it into `shell-exec` (after SAFE-21, before the clamp),
   `runRunner`, `shellProdWhy` and `runnerProdWhy`.
4. `tests/shell.store-guard.test.ts`: each form against a temp store with
   the rows read back; fail-closed, siblings, scripts, still-runs, SAFE-21
   first, no Approve card, runners, memory tools behind the owner's DM card, unit cases and
   the residual. Prove it fails on the base sources.
5. Spec prose, delta, module testing evidence, docs (DISCORD-GO-LIVE.md
   shell and runner rows, discord.md memory section).
6. `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
