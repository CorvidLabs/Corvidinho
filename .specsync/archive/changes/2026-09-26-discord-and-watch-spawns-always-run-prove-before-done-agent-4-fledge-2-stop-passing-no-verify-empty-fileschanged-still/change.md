---
id: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
state: archived
type: feature
base_commit: 19683b6059902c62baeddb9d2110f64f82dc3009
---

# Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice)

## Intent

Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice)

## Affected Canonical Specs

- `discord`
- `watch`
- `cli`

## Acceptance Criteria

- Discord and WATCH createSpawnAgentClient argv is task run --task <prompt> --output ndjson with no --no-verify; empty filesChanged still skips verify; when tools report filesChanged verify runs (AGENT-4 / FLEDGE-2); CLI --no-verify local opt-out only; package 0.0.13; fixture tests; SpecSync + fledge verify green; Made with Corvidinho

## No-spec Rationale

Not applicable
