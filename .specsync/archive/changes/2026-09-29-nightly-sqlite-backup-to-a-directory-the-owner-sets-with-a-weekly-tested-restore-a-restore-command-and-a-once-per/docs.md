---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: docs
---

# Docs

- `docs/DAEMON.md`: new "Nightly backup (OPS-1/2)" section (when, how,
  restore test, told, status) and "Restore"; does/does-not table; config table
  (`CORVIDINHO_BACKUP_DIR`; "adds no new variables" corrected); log events
  (`backup.*`, `restore_test.*`, `daemon.started` `backup`).
- `docs/discord.md`: the announce channel carries the backup failure notice
  (owner-only ping, once per streak, nothing elsewhere without a channel);
  the outbound-mentions paragraph names that owner ping.
- `docs/DISCORD-GO-LIVE.md`: env list, E.4 daemon env, E.7 logs table row.
- `docs/BOX-UPDATE.md`: `backup` is a `[warn]` line that never fails doctor.
- `README.md`: "Nightly backup" section; `.env.example`: `CORVIDINHO_BACKUP_DIR`.
- `AGENTS.md` / `STATUS.md`: `ops` in the hi family lists (19 families).
- `hi/ops.md` (new) + `INTENT.md` index (from `hi`).
- Specs: `specs/cli/cli.spec.md` (files, API, invariants, examples, errors,
  dependencies), `specs/discord/discord.spec.md` (scheduler paragraph),
  both `testing.md`.
