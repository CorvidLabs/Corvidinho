---
module: agent
version: 15
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
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/spawn.argv.test.ts

db_tables: []
depends_on:
  - plugins
---

# Agent

## Purpose

Prove-before-done agent task loop with SpecSync-aware Planning and an interruptible LLM plugin tool loop when an API key is configured.

## Public API

Also export `selectRelevantSpecs`, `extractConstraintSections`, `loadRelevantSpecs`, `buildCorvidinhoArgv`, `createTaskExecute`, `loadLlmEnv`, `summarizeTaskRunOutput`, `parseCapabilityTier`, `loadTierFromEnv`, `tierAllowsPlugin`, `buildOpenAiTools`, `argvFromToolArguments`, `filesChangedFromToolData` from the agent module. AgentEvent includes ToolCall and ToolResult.

## Invariants

Planning loads specs before execute when possible; SpecSync check participates in done-gate via fledge verify lane; LLM tool loop honors AbortSignal and SAFE-1 dangerous deny; no SpecSync cloud key; no Trust/attest.

## Behavioral Examples

#### Scenario: Tool loop calls plugin then finishes

- **Given** an API key and tool/code tier with mocked chat completions
- **When** the model returns a tool_call for an allowlisted plugin then a final text message
- **Then** the plugin runs via runPlugin, ToolCall/ToolResult events emit, and ExecuteResult.summary is the final text

#### Scenario: Read tier has no tools

- **Given** an API key and tier=read
- **When** createTaskExecute runs
- **Then** the chat request omits tools and returns assistant text only

## Error Cases

| Condition | Behavior |
|-----------|----------|
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
| 2026-09-26 | spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene: Spawned agents ignore the project .env and tests never create real worktrees (ALLOW-4 / SAFE-1 / SESSION-WORKTREE-3 hygiene): bun-invoked spawns pass --no-env-file so a project worktree's .env cannot inject allowlists, admin lists or keys into the agent; bridge and slash fixture tests use temp project roots so bun test never adds talk/* worktrees or branches to the repo |
