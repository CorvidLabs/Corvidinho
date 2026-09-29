---
module: discord
change: nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per
---

# Delta — discord (bridge tick runs the nightly backup and tells the owner)

## Added

### REQUIREMENT REQ-discord-680

The Discord bridge's scheduler tick SHALL run the nightly backup and restore
test of REQ-cli-680 (`createBackupTicker` over the bridge's shared DB, passed
to `SchedulerService` as `backup`; `SchedulerService.tick` SHALL call it with
its clock after the due runs are claimed, never throwing). It SHALL log each
run as one scrubbed `[backup] <event> {json}` console line.

OPS-1 "I'm told if it fails": on each tick the bridge SHALL deliver pending
backup / restore-test owner notices (recorded by its own tick or by a daemon
on the same data dir): claim one (compare-and-delete in `schema_meta`), post
it to the `/announce` channel (DISCORD-ANNOUNCE) as fixed text
(`formatBackupNotice`: `⚠️ The nightly backup failed (<UTC time>)…` or
`⚠️ The restore test failed (<UTC time>)…`, pointing at `corvidinho doctor`
on the host, tagged OPS-1 / OPS-2) — prefixed with the owner mention and with allowed mentions
limited to the owner (REQ-discord-205), never a host path or the error text.
A post that does not go out (no announcements channel, no gateway, Discord
refused it) SHALL hand the notice back for the next tick and log
`…owner_not_told` once; with no announcements channel nothing is posted
anywhere else. One notice per failure streak (REQ-cli-680). `schedulerNow`
is a test seam for the scheduler and backup clock.

Acceptance Criteria
- A bridge whose backup dir is a file, with an announcements channel and an owner, posts exactly one reply to that channel over many ticks: it starts with `<@owner> ⚠️ The nightly backup failed`, `mentionUserIds` is [owner], it holds no host path; the notice is cleared and the failure streak recorded.
- Without an announcements channel no reply is posted and the notice stays pending.
- A good backup dir gets tonight's snapshot from the bridge tick and nobody is pinged.
- `SchedulerService.tick` hands its clock to the backup ticker on every tick.
