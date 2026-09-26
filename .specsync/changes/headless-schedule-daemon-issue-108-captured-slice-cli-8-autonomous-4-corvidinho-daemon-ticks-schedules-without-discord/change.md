---
id: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
state: implementing
type: feature
base_commit: 8747a9abb99c2322ea67c40da96fb60bc69172bc
---

# Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other

## Intent

Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other

## Affected Canonical Specs

- `cli`
- `discord`

## Acceptance Criteria

- corvidinho daemon ticks the SQLite schedules table on the 60s poll without a Discord token (CLI-8 / AUTONOMOUS-4); a second daemon on the same data dir refuses to start and names the holder pid, a stale lock from a dead pid is taken over; SIGTERM/SIGINT stop ticking, wait a bounded grace for in-flight runs, mark stragglers failed, release the lock and exit 0; logs are one scrubbed JSON object per line; each due run is claimed atomically in SQLite so a daemon and a bridge sharing one data dir fire it exactly once and never overwrite each other's pause/resume or run counters; docs/DAEMON.md shows a systemd unit; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
