---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: tasks
---

# Tasks

- [x] Regression tests fail before the fix.
- [x] Pin spawned Bun config to `/dev/null` in `buildCorvidinhoArgv`.
- [x] SAFE-2 protects `bunfig.toml` / `.bunfig.toml`.
- [x] Update argv expectations (spawn + delegate tests).
- [x] Deltas: Modified REQ-agent-133, REQ-plugins-083.
