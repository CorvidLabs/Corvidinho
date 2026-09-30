---
module: cli
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
---

# Delta: cli (the daemon reads the owner live for each schedule run, DISCORD-SCHEDULE-1.a)

## Added

### REQUIREMENT REQ-cli-741

The daemon reads the owner live for each schedule run (DISCORD-SCHEDULE-1.a,
#124). `startDaemon` SHALL pass the scheduler, besides the start-time owner
it already passes for the creator gate (REQ-cli-108), a `loadOwner` that
re-reads the owner config (`loadOwnerConfig({ env })`: env over the
allowlist file's `[owner]`) at each run, so only the owner as configured now
gets the owner stamp for their own schedule (REQ-discord-741) and an owner
change in the file applies to the next run without a restart. No env var,
config key, flag or log event is added.

Acceptance Criteria
- `tests/scheduler.owner-role.test.ts` ("daemon: …"): with an allowlist file naming the owner, the owner's due schedule is spawned `actingIsAdmin: true`; after the file names another owner the next due run of it is spawned `actingIsAdmin: false`, with no restart.
- The test fails with the base sources (always `false`).
