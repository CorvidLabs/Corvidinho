---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: requirements
---

# Requirements

1. `corvidinho daemon` SHALL tick the schedules table headlessly, with no
   Discord token and no REPL, on the existing 60 s poll (REQ-cli-108).
2. Only one daemon SHALL run per data dir. A second one SHALL exit 1 and name
   the holder's pid. A lock whose pid is dead or recycled SHALL be taken over.
3. SIGTERM/SIGINT SHALL stop ticking, wait up to 30 s for in-flight runs,
   record the runs still going as failed, remove the lock and exit 0. A second
   signal SHALL skip the rest of the wait.
4. Daemon logs SHALL be one JSON object per line, with every string scrubbed
   (SAFE-6).
5. Schedule tickers SHALL re-read the table each tick, claim each due run with
   a compare-and-set, and write only the columns each update owns. A bridge
   and a daemon on one data dir then fire each run once and never undo each
   other's pause/resume or run counters (REQ-discord-108).
6. `docs/DAEMON.md` SHALL show a systemd unit and SHALL leave restarts to
   systemd's own `Restart=`.

Out of scope (draft, not captured): OPS-3 (one supervised process running the
bridge, watch, AlgoChat and scheduler, restarting itself), OPS-4 (heartbeat
and uptime in `/status`), OPS-5 (crash/restart DM).
