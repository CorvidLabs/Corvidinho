---
id: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
state: verifying
type: bug_fix
base_commit: c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233
---

# Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo

## Intent

Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- buildCorvidinhoArgv invokes .ts entrypoints as bun --no-env-file <bin> so a .env in the spawn cwd (project worktree) never reaches the spawned agent; config comes only from the parent's explicit env (ALLOW-4, SAFE-1); a fixture proves a cwd .env value does not reach the child; bridge and slash fixture tests use temp non-git project roots so bun test creates no talk/* worktrees or branches in the repo; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
