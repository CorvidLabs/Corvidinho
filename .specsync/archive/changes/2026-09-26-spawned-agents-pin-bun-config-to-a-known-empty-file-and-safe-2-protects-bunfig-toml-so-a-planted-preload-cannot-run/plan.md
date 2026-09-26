---
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
artifact: plan
---

# Plan

1. Regression tests (planted bunfig preload never runs in a spawned child; SAFE-2 refuses bunfig writes); confirm they fail on main.
2. Pin `--config=/dev/null` in `buildCorvidinhoArgv`; add bunfig to `isProtectedPath`.
3. Update exact-argv expectations; Modified REQ-agent-133 and REQ-plugins-083.
