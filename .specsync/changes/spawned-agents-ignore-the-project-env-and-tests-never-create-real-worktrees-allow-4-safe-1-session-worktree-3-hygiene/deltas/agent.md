---
module: agent
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
---

# Delta — agent (spawn ignores project .env)

## Added

### REQUIREMENT REQ-agent-010

When Corvidinho spawns its own `.ts` entrypoint (Discord/WATCH agent runs,
protocol handshake), it SHALL invoke `bun --no-env-file <bin>` so `.env*` files
in the spawn cwd (a project worktree) are never loaded into the agent. Agent
configuration (allowlists, admin lists, keys) SHALL come only from the
environment the parent passes (ALLOW-4 / SAFE-1). Fixture tests SHALL use
temporary project roots so test runs create no worktrees or branches in the
repository (SESSION-WORKTREE-3 hygiene).

Acceptance Criteria
- `.ts` spawn argv is `bun --no-env-file <bin> ...`; non-`.ts` bins unchanged.
- A `.env` in the spawn cwd does not reach the child.
- `bun test` leaves no `talk/*` worktrees or branches behind.
