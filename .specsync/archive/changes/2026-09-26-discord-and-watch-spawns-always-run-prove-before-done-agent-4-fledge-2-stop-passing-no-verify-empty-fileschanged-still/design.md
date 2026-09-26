---
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
artifact: design
---

# Design

Spawn argv: `task run --task <prompt> --output ndjson` (no `--no-verify`).
Loop still skips verify when `filesChanged` is empty. CLI `--no-verify` stays
for local skips. Out of scope: AGENT-14/15, SAFE-22 / #82 porcelain extras.
