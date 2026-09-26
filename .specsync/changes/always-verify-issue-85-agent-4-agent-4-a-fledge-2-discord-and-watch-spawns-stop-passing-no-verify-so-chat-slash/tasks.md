---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: tasks
---

# Tasks

- [x] Worktree delta probe module (`src/agent/workspace-delta.ts`)
- [x] Plain verification line module (`src/agent/verify-report.ts`)
- [x] `runTask` gate: tool report OR worktree delta; notes on every result
- [x] `RunTaskOptions.workspaceProbe` injection seam
- [x] Discord + WATCH spawn argv drop `--no-verify`
- [x] Failure bodies (bridge, `/session`, `/work`, scheduler) surface the FAILED line
- [x] Help text, `fledge.toml` comment, docs, spec bodies and `files:` coverage
- [x] Fixture tests (temp repos, fake probes, fake bins, scheduler fake agent)
- [x] Spec deltas + SpecSync check + tsc + bun test + fledge verify
