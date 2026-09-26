---
module: agent
version: 19
status: draft
files:
  - src/agent/types.ts
  - src/agent/config.ts
  - src/agent/verify.ts
  - src/agent/loop.ts
  - src/agent/specLoader.ts
  - src/agent/index.ts
  - src/agent/task-summary.ts
  - src/agent/execute.ts
  - src/agent/spawn-argv.ts
  - src/agent/tier.ts
  - src/agent/tools.ts
  - src/agent/events-ndjson.ts
  - src/agent/workspace-delta.ts
  - src/agent/verify-report.ts
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/spawn.argv.test.ts
  - tests/agent.events-ndjson.test.ts
  - tests/agent.ndjson-spawn.test.ts
  - tests/agent.verify-gate.test.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010).

## Public API

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

NDJSON event stream (REQ-agent-073, issue #73): `src/agent/events-ndjson.ts`
owns `CORVIDINHO_PROTOCOL_VERSION` (2) and exports `frameFromEvent`,
`usageFrame`, `resultFrame`, `serializeFrame`, `createNdjsonWriter`,
`summarizeToolArgs`, `parseNdjsonLine`, `createNdjsonParser`,
`readNdjsonStream`, `progressFromFrame`, `collectTaskRunStream`. Frames:
`{protocol, type}` with AgentEvent types `StateChanged` / `Text` / `ToolCall`
(`name`, `argsSummary`) / `ToolResult` / `VerifyResult`, plus `usage`
(running prompt / completion / total tokens) and a final `result`
(`TaskResult`). `createTaskExecute({ onUsage })` reports running provider
totals; `extractUsage` reads OpenAI-compatible `usage`.

Always verify (REQ-agent-085, issue #85): `src/agent/workspace-delta.ts`
exports `snapshotWorkspace`, `workspaceChangedSince`, `parsePorcelainZ`,
`createGitWorkspaceProbe`, `gitWorkspaceProbe`, `defaultGitRunner` and the
`WorkspaceProbe` / `WorkspaceSnapshot` / `GitRunner` types;
`RunTaskOptions.workspaceProbe` (default the probe for `cwd`, `null` = off).
`src/agent/verify-report.ts` exports `verificationNote`,
`withVerificationNote`, `describeFailedRun`, `NO_CHANGES_NOTE` and the
`VerificationOutcome` type.

## Invariants

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

NDJSON frames never carry raw tool arguments; ToolCall `argsSummary`, Text,
ToolResult detail and VerifyResult output are SAFE-6 scrubbed and capped.
AgentEvent stays frozen (usage is a separate callback), so `task run --json`
events are unchanged.

The verify gate fires when a tool reported `filesChanged` OR the real worktree
changed since the run started; the worktree probe only adds a reason to
verify, never removes one. Every non-cancelled `TaskResult.summary` carries
exactly one fixed verification line (Verified / Verification FAILED / NOT
verified / No files changed), never built from model or lane output.

## Behavioral Examples

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

### Scenario: Unreported edit still hits the verify lane

- **Given** a clean worktree and a tool that writes a file without reporting `filesChanged`
- **When** `runTask` finishes the execute step
- **Then** the worktree delta is non-empty, the verify lane runs, and the summary leads with `Verified:` or `Verification FAILED:`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| cwd not in a worktree / probe fails | tool-reported `filesChanged` alone decides the gate |
| Verify exhausted | state failed, verified=false, summary includes verifier output |
| AbortSignal fired | cancelled=true (outer loop) or execute returns early mid tool loop |
| fledge missing | verify failure output names PATH miss |
| SpecSync registry missing | Planning soft-fails; execute continues |
| Dangerous plugin + non-interactive + not allowlisted | ToolResult success=false (SAFE-1); loop may continue |

## Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

## Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).
| 2026-09-26 | flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP) |
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash: Always verify (issue #85, AGENT-4 / AGENT-4.a / FLEDGE-2): Discord and WATCH spawns stop passing --no-verify so chat, slash, schedule and GitHub-started changes run the project verify lane; the gate also fires on a real worktree delta so edits no tool reported cannot skip it; every task result carries a plain verification line and failed Discord and schedule replies surface the FAILED line instead of only an exit code |
