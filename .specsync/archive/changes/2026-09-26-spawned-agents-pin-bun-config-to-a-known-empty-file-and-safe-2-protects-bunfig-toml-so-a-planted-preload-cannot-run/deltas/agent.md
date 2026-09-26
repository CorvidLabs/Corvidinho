---
module: agent
change: spawned-agents-pin-bun-config-to-a-known-empty-file-and-safe-2-protects-bunfig-toml-so-a-planted-preload-cannot-run
---

# Delta — agent (spawn pins Bun config)

## Modified

### REQUIREMENT REQ-agent-133

When Corvidinho spawns its own `.ts` entrypoint (Discord/WATCH agent runs,
protocol handshake), it SHALL invoke `bun --no-env-file --config=/dev/null <bin>`
so `.env*` files in the spawn cwd (a project worktree) are never loaded into
the agent and Bun config (including `bunfig.toml` `preload`) is never read from
the spawn cwd; the child's Bun config is pinned to a known-empty file. Agent
configuration (allowlists, admin lists, keys) SHALL come only from the
environment the parent passes (ALLOW-4 / SAFE-1). Fixture tests SHALL use
temporary project roots so test runs create no worktrees or branches in the
repository (SESSION-WORKTREE-3 hygiene).

Acceptance Criteria
- `.ts` spawn argv is `bun --no-env-file --config=/dev/null <bin> ...`; non-`.ts` bins unchanged.
- A `.env` in the spawn cwd does not reach the child.
- A `bunfig.toml` `preload` in the spawn cwd never runs in the child.
- `bun test` leaves no `talk/*` worktrees or branches behind.
