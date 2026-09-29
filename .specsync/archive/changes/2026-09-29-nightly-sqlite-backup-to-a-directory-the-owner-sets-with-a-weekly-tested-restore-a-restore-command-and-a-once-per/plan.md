---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: plan
---

# Plan

1. Capture OPS-1/2 with `hi` (own commit); `hi check`.
2. `src/store/backup.ts` + `tests/ops.backup.test.ts`.
3. Wire the ticker into `SchedulerService`, the daemon and the bridge;
   `tests/ops.backup-wiring.test.ts` (no backup.ts import, so each test fails
   on its own assertion on the base).
4. CLI `backup list|restore`, doctor line, preload strips the operator's
   `CORVIDINHO_BACKUP_DIR`.
5. Docs: DAEMON.md, discord.md, DISCORD-GO-LIVE.md, BOX-UPDATE.md, README,
   .env.example, AGENTS.md / STATUS.md hi family lists; specs + deltas.
6. Prove fail-on-base (swap base `src/` in, run the two test files, restore).
7. `specsync change approve/check/audit`, `specsync check --require-coverage
   100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify
   --non-interactive`.
