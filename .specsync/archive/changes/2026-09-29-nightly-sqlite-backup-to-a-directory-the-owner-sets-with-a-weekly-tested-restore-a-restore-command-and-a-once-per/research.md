---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: research
---

# Research

- bun:sqlite 1.4.2 (SQLite 3.53.2) exposes no `sqlite3_backup_*`; it has
  `serialize()` (whole DB in memory) and SQL. `VACUUM INTO` is SQLite's
  documented online snapshot ("can be used as an alternative to the backup
  API"): one read transaction, so the copy is consistent while other
  connections write. Checked here: with a second connection holding an
  uncommitted `BEGIN IMMEDIATE` insert, `VACUUM INTO ?` (bound parameter works)
  copies only committed rows. It does not fsync the output, so the file is
  fsynced before the rename.
- corvid-agent steal (issue #68): `deploy/backup-db.sh` + a launchd plist
  (nightly job) and `docs/backup-and-recovery.md`; here the existing scheduler
  tick replaces the external timer (bridge and daemon both tick; the night is
  claimed in SQLite like schedule runs).
- Owner notice path: the bridge has no DM path (DISCORD-5); the SAFE-8
  outbox rides every post site; the `/announce` channel (DISCORD-ANNOUNCE-1,
  "ops/dev announcements") is the one owner-configured ops channel the bridge
  already posts to outside the chat allowlist.
- `scripts/corvidinho-update.sh` rolls back when `doctor` fails, so an
  optional feature's doctor line must not fail doctor.
- `/proc/<pid>/fd` readlink gives the holder check (Linux-only project);
  processes of other users are invisible unless root, so a live
  `daemon.lock` beside `corvidinho.db` is checked too.
