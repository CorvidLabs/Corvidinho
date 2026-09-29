---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: tasks
---

# Tasks

- [x] Capture OPS-1 and OPS-2 with `hi` into `hi/ops.md` (own commit); `hi check` passes.
- [x] `src/store/backup.ts`: config, snapshot, rotation, check, holders, restore, restore test, `schema_meta` state, notices, ticker.
- [x] `SchedulerServiceOpts.backup` called from `tick()`; daemon and bridge build the ticker (bridge `notify` → announce channel, owner-only ping); test seams `now` / `schedulerNow`.
- [x] CLI `backup list` / `backup restore` + help/env lines; doctor `backup` line (`[warn]`, never failing); preload strips `CORVIDINHO_BACKUP_DIR`.
- [x] `tests/ops.backup.test.ts` (21) and `tests/ops.backup-wiring.test.ts` (11); both fail on the base sources and pass on the branch.
- [x] Docs (DAEMON, discord, GO-LIVE, BOX-UPDATE, README, .env.example, AGENTS/STATUS hi lists) and specs (cli + discord spec, testing, deltas REQ-cli-680 / REQ-discord-680).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
