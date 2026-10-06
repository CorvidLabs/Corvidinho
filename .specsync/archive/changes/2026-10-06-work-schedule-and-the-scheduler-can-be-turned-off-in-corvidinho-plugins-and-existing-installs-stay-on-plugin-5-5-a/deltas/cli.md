---
module: cli
change: work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a
---

# Delta: cli (the daemon's schedule runs follow [corvidinho.plugins] schedule and it logs the switch — PLUGIN-5.a)

## Added

### REQUIREMENT REQ-cli-157

PLUGIN-5.a in `corvidinho daemon`. `startDaemon` SHALL read
`[corvidinho.plugins] schedule` through `loadExtrasToggles({ installRoot:
projectRoot, env })` (its working directory's `fledge.toml` and the
allowlist file, REQ-agent-157) at start and at every tick, and pass it to the
scheduler as `schedulesEnabled` (REQ-discord-157), so while it is off a tick
claims and starts no schedule run, runs in flight finish and the nightly
backup still runs; no restart is needed.

- `daemon.started` SHALL carry `schedules`: `on`, `off` or
  `config-unreadable`.
- When it is not on at start, a `schedules.off` warn line SHALL follow with
  `reason` (`off` plus `offIn`, or `config-unreadable` plus `error`;
  never a path).
- Each later change SHALL be logged once: `schedules.off` (warn, same
  fields) or `schedules.on` (info).
- `[corvidinho.autonomous]` SHALL have no say.

Acceptance Criteria
- `schedule = false` in the allowlist file: `daemon.started` has `schedules: "off"`, then one `schedules.off` (`level: "warn"`, `reason: "off"`, `offIn: ["allowlist file"]`); two ticks return `{ started: [], skipped: [] }` with no run row while the nightly backup writes one snapshot (`backup.ok`); after the file is emptied the next tick logs one `schedules.on` and starts the due schedule.
- Nothing set: `daemon.started` has `schedules: "on"`, no `schedules.off`, and the due schedule runs.
- An install root whose `fledge.toml` is a directory: `schedules: "config-unreadable"` and `schedules.off` with `error: "the install's fledge.toml could not be read (EISDIR)"`; a tick starts nothing.
- Fixture: `tests/plugins.extras-toggle.test.ts`.
