---
change: headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord
artifact: docs
---

# Docs

- New `docs/DAEMON.md` covers what the daemon does and does not do, running
  it next to the bridge, configuration (no new env vars), the
  single-instance lock, the shutdown steps, the log events, and a systemd
  unit example. Restarts are left to systemd's own `Restart=on-failure`.
- README gets a short "Schedule daemon" section linking the doc.
- `corvidinho --help` lists `daemon`.
- CHANGELOG/STATUS/package version are left to the release PR.
