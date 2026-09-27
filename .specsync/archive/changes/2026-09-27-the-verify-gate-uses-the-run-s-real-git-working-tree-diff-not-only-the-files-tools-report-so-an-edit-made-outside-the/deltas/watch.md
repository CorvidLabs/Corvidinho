---
module: watch
change: the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the
---

# Delta — watch (verify skip wording follows the real diff)

## Modified

### REQUIREMENT REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL NOT pass `--no-verify` — prove-before-done (AGENT-4 / FLEDGE-2)
is the default for ingress runs; an empty real diff with no tool-reported
files still skips verify inside the agent loop (REQ-agent-085). Fixture tests
SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQUIREMENT REQ-watch-085

WATCH `createSpawnAgentClient` SHALL always hold ingress runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. Same skip as Discord: an empty real diff
with no tool-reported files skips verify; a run that changed the git working
tree is verified before done (REQ-agent-085).
Draft AGENT-14/15 out of scope. Package **0.0.13**. Fixture tests without live
tokens.

Acceptance Criteria
- WATCH spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/WATCH.md updated.
- Fixture tests + SpecSync + fledge verify green.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool-reported files still skips verify (REQ-agent-085).
