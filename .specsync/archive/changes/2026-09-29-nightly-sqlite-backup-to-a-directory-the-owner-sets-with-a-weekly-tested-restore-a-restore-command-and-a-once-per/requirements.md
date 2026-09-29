---
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
artifact: requirements
---

# Requirements

- Added REQ-cli-680 (delta `deltas/cli.md`): `CORVIDINHO_BACKUP_DIR` (unset =
  off, relative = invalid, in a git work tree = refused); nightly checked
  `VACUUM INTO` snapshot from 03:00 local once per night per data dir
  (claimed in SQLite), 0600, UTC name, newest 7 kept, SAFE-6 scrubbing carried;
  restore test weekly (nightly while failing) through the restore code into a
  temp dir with integrity / schema version / tables / row counts; every run
  logged (daemon JSON lines, `backup` on `daemon.started`); owner notice
  recorded once per failure streak; `corvidinho backup list|restore` (held
  target refused even with --force, existing target needs --force); doctor
  `backup` line, `[warn]` never failing.
- Added REQ-discord-680 (delta `deltas/discord.md`): the bridge's scheduler
  tick runs the same ticker (`SchedulerServiceOpts.backup`), logs `[backup]`
  lines and delivers pending notices to the `/announce` channel as fixed text
  with only the owner pinged, handed back when not posted, nothing posted
  elsewhere without a channel.
- HI: OPS-1, OPS-2 (captured in this PR). Unchanged and relied on:
  DISCORD-ANNOUNCE-1..6, DISCORD-5, SAFE-6, AUTONOMY-2, CLI-8 / AUTONOMOUS-4.
  No acceptance criteria beyond the captured text.
