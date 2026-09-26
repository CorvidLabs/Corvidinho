---
module: agent
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
---

# Delta — agent (LLM tool loop MVP)

## Modified

### REQUIREMENT REQ-agent-007

The execute hook for `task run` SHALL call an OpenAI-compatible chat completions endpoint when `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`), and SHALL keep the demo execute stub (synthetic filesChanged for the verify-gate exercise) when no key is set. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover no-key path; key path mocks fetch (no live API in CI).

### SPEC SECTION Purpose

Prove-before-done agent task loop with SpecSync-aware Planning and an interruptible LLM plugin tool loop when an API key is configured.

### SPEC SECTION Public API

Also export `selectRelevantSpecs`, `extractConstraintSections`, `loadRelevantSpecs`, `buildCorvidinhoArgv`, `createTaskExecute`, `loadLlmEnv`, `summarizeTaskRunOutput`, `parseCapabilityTier`, `loadTierFromEnv`, `tierAllowsPlugin`, `buildOpenAiTools`, `argvFromToolArguments`, `filesChangedFromToolData` from the agent module. AgentEvent includes ToolCall and ToolResult.

### SPEC SECTION Invariants

Planning loads specs before execute when possible; SpecSync check participates in done-gate via fledge verify lane; LLM tool loop honors AbortSignal and SAFE-1 dangerous deny; no SpecSync cloud key; no Trust/attest.

### SPEC SECTION Behavioral Examples

#### Scenario: Tool loop calls plugin then finishes

- **Given** an API key and tool/code tier with mocked chat completions
- **When** the model returns a tool_call for an allowlisted plugin then a final text message
- **Then** the plugin runs via runPlugin, ToolCall/ToolResult events emit, and ExecuteResult.summary is the final text

#### Scenario: Read tier has no tools

- **Given** an API key and tier=read
- **When** createTaskExecute runs
- **Then** the chat request omits tools and returns assistant text only

### SPEC SECTION Error Cases

| Condition | Behavior |
|-----------|----------|
| Verify exhausted | state failed, verified=false, summary includes verifier output |
| AbortSignal fired | cancelled=true (outer loop) or execute returns early mid tool loop |
| fledge missing | verify failure output names PATH miss |
| SpecSync registry missing | Planning soft-fails; execute continues |
| Dangerous plugin + non-interactive + not allowlisted | ToolResult success=false (SAFE-1); loop may continue |

### SPEC SECTION Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

### SPEC SECTION Change Log

Flesh LLM tool loop MVP on prove-before-done (#31) (2026-09-26, corvid-agent).

## Added

### REQUIREMENT REQ-agent-008

The system SHALL run an interruptible OpenAI-compatible tool loop when an LLM API key is set and the capability tier is `tool` or `code`: it SHALL expose non-dangerous registered plugins as `tools`, SHALL dispatch `tool_calls` via `runPlugin` under SAFE-1 non-interactive deny unless allowlisted, SHALL emit `ToolCall` and `ToolResult` events, SHALL stop promptly on AbortSignal (AGENT-3), and SHALL collect `filesChanged` only when a tool result reports them so prove-before-done stays honest (AGENT-4).

Acceptance Criteria
- Mock HTTP fixture: tool_call → plugin runs → final text summary.
- Dangerous plugin without allowlist → ToolResult success=false under non-interactive.
- Aborted signal mid-loop returns without claiming success completion of further rounds.
- filesChanged empty unless a tool payload includes filesChanged.

### REQUIREMENT REQ-agent-009

The system SHALL accept capability tier `read|tool|code` via `--tier` or `CORVIDINHO_LLM_TIER` (default `tool`) so read-shaped work gets no tools and tool/code tiers filter plugins by `minTier` (AGENT-5). The default tool catalog SHALL omit dangerous plugins; runtime SAFE-1 SHALL still apply when dangerous tools are included.

Acceptance Criteria
- read → no tools in chat request.
- tool/code → buildOpenAiTools filters by minTier; dangerous omitted by default.
