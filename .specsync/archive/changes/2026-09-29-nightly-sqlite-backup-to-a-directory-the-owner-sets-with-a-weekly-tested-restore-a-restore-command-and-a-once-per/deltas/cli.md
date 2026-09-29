---
module: cli
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
---

# Delta — cli (nightly backup, restore test, restore command, doctor line)

## Added

### REQUIREMENT REQ-cli-680

OPS-1 ("A nightly backup goes to a place I choose, and I'm told if it fails.")
and OPS-2 ("A backup can be restored, and the restore is tested regularly.")
SHALL be met by `src/store/backup.ts`, run from the existing scheduler tick
(REQ-discord-680 for the bridge; `corvidinho daemon` here), with a restore
command and a doctor line.

- Place. `CORVIDINHO_BACKUP_DIR` (optional) SHALL name the backup directory.
  Unset or blank SHALL mean no backup (today's behaviour). A relative path
  SHALL be invalid. A directory at or below a directory holding `.git` SHALL
  be refused (snapshots hold private notes, SAFE-6). The directory SHALL be
  created with mode 0700 when missing. No other new env var or config key.
- Nightly snapshot. At the first scheduler tick at or after 03:00 local time,
  once per local day per data dir (the night claimed in an IMMEDIATE
  transaction on `schema_meta`, so a bridge and a daemon on one data dir back
  up once), the ticker SHALL write `VACUUM INTO` of the live connection (one
  read transaction: consistent while other processes write) to a temp name
  under umask 077, check it (`PRAGMA integrity_check` `ok`, schema version
  1..SCHEMA_VERSION, every table of the current schema at SCHEMA_VERSION, every
  table countable), fsync it and rename it to `corvidinho-<YYYYMMDD>T<HHMMSS>Z.db`
  (UTC, mode 0600). `ensureScrubbed` SHALL run first, so the snapshot carries
  the DB's SAFE-6 scrubbing. Afterwards only the newest 7 snapshots SHALL be
  kept; files not matching the snapshot name SHALL never be touched. A failure
  SHALL leave no partial file.
- Restore test. In the same night slot, when no test ran for 7 days, or the
  last one failed, and the directory holds a snapshot (none ⇒ skipped and
  logged), the newest snapshot SHALL be restored with `restoreSnapshot` into a
  fresh temp dir, checked as above, its row counts compared with the counts
  recorded when that snapshot was taken, and the temp dir deleted.
- Logged. Each run SHALL be logged: `backup.ok` (dir, snapshot, bytes,
  schemaVersion, counts, removed; `recovered` when it ends a streak),
  `backup.failed` (error; `ownerNotice`), `restore_test.ok` /
  `restore_test.failed` / `restore_test.skipped`. The daemon logs them as
  scrubbed JSON lines (REQ-cli-108 logger) and SHALL add `backup` (the
  directory, `off`, or why it is unusable) to `daemon.started`.
- Told, once per failure streak. The first failure of a job (backup or
  restore test) after a success or none SHALL record an owner notice in
  `schema_meta` and the scrubbed one-line reason; later failures of the same
  streak SHALL only update the reason and log; a success SHALL end the streak.
  The daemon has no Discord: its notices stay pending for a bridge
  (REQ-discord-680).
- Restore command. `corvidinho backup list` SHALL print the snapshots newest
  first; `corvidinho backup restore <snapshot> <target> [--force]` SHALL accept
  only a snapshot name from the configured directory, check it, and write it
  to the target (copy next to it, 0600, fsync, the old file's
  `-journal` / `-wal` / `-shm` removed, rename, then check the restored file).
  A target any process holds open (Linux `/proc/<pid>/fd`, plus a live
  `daemon.lock` next to a target named `corvidinho.db`) SHALL be refused even
  with `--force`, so the live DB is never overwritten while a process holds
  it; any other existing target SHALL need `--force`. Refusals exit 1 with one
  `restore refused: …` line. `--help` SHALL list both.
- Doctor. `corvidinho doctor` SHALL print a `backup` line: `[warn]` `off —
  CORVIDINHO_BACKUP_DIR is not set …` when unset; `[warn]` with the reason
  for an invalid, in-repo, non-directory or unwritable path; else the
  directory, snapshot count and newest, and the last backup and restore test
  (`[ok]`), or the failing job's reason and whether the owner was told
  (`[warn]`). It SHALL never fail doctor (the box updater rolls back on a
  failing doctor) and SHALL create nothing.

No new table, column or schema version: state lives in `schema_meta` `ops_*`
keys. No encryption (the directory is local); no remote target.

Acceptance Criteria
- A snapshot taken while another connection holds an uncommitted write contains only committed rows, is named by UTC time, mode 0600 in a 0700 dir, passes `checkDbFile`, and leaves no temp file.
- With stored rows from before a scrub-rules bump, the snapshot holds the redacted text, never the key.
- Nine nightly snapshots leave the newest 7; unrelated files in the directory stay.
- A directory inside a git work tree and a path that is a file are refused with no file written.
- `restoreSnapshot` restores to a new target (0600, rows present); refuses a target this process holds open even with force (live DB unchanged) and one named by a live `daemon.lock`; an existing idle target needs force and its stale `-journal` is removed; a traversal name, a missing name, a corrupt snapshot and a directory target are refused.
- `runRestoreTest` passes on the newest snapshot and leaves the temp root empty; it fails on a corrupt newest snapshot, on row counts that differ from the recorded ones, and with no snapshot.
- The ticker does nothing when unset; runs once per night from 03:00 local across two connections on one data dir; runs the restore test on the first night and again 7 days later; a failing backup is logged and tells the owner once per streak with fixed text (no path, no error), again after a success and a new failure; a daemon ticker leaves the notice pending; a failing restore test is retried nightly and told once.
- `corvidinho daemon` logs `daemon.started` with `backup`, its tick writes one snapshot and logs `backup.ok` and `restore_test.ok`; a failing dir logs `backup.failed` (error) and leaves `ops_backup_notice`; unset logs `backup: "off"` and no backup events.
- `backup list` / `backup restore` via the CLI; restore onto the DB the test process holds exits 1 with `is open in process <pid>`; unset dir exits 1; `--help` lists both; `doctor` prints `[warn] backup: off …` unset and `[ok] backup: <dir> — 1 snapshot(s)` set; the doctor line is `[warn]` (never failing) for invalid, in-repo and failing states and shows `owner not told yet` / `owner told`.
