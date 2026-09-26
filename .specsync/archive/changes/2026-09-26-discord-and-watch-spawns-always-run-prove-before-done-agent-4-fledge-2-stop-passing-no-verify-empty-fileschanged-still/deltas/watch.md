---
module: watch
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
---

# Delta — watch (always verify spawn)

## Modified

### REQUIREMENT REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL NOT pass `--no-verify` — prove-before-done (AGENT-4 / FLEDGE-2)
is the default for ingress runs; empty `filesChanged` still skips verify
inside the agent loop. Fixture tests SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

## Added

### REQUIREMENT REQ-watch-085

WATCH `createSpawnAgentClient` SHALL always hold ingress runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. Same empty-`filesChanged` skip as Discord.
Draft AGENT-14/15 out of scope. Package **0.0.13**. Fixture tests without live
tokens.

Acceptance Criteria
- WATCH spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/WATCH.md updated.
- Fixture tests + SpecSync + fledge verify green.
