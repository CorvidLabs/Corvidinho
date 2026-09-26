---
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
artifact: plan
---

# Plan

1. Deltas: agent (Added REQ-agent-085; Modified REQ-agent-002, REQ-agent-003),
   cli (Modified REQ-cli-006, REQ-cli-007, REQ-cli-009), discord (Added
   REQ-discord-085; Modified REQ-discord-001, REQ-discord-014,
   REQ-discord-073), watch (Modified REQ-watch-006, REQ-watch-073).
2. New modules `src/agent/workspace-delta.ts` and `src/agent/verify-report.ts`.
3. Small hooks: `runTask` gate + notes; `RunTaskOptions.workspaceProbe`;
   drop `--no-verify` from both spawn clients; `describeFailedRun` in the four
   failure bodies (bridge, `/session`, `/work`, scheduler).
4. Help text, `fledge.toml` comment, docs, spec bodies + `files:` coverage.
5. Tests: `tests/agent.verify-gate.test.ts` (temp repos, fake probes, fake
   bins, scheduler fake agent); update argv expectations in existing tests.
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`; change approve + check.
