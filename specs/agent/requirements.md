# Agent — requirements

See agent.spec.md REQ-agent-001..003 via SpecSync change deltas.

### REQ-agent-001

The system SHALL expose task states idle, planning, executing, verifying, done, and failed (AGENT-8).

Acceptance Criteria
- `runTask` emits `StateChanged` for planning → executing → verifying → done|failed.
- `TaskResult` includes `state` reflecting the terminal state.

### REQ-agent-002

When `verify_before_complete` is enabled and the execute step reports files changed, completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2).

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.

### REQ-agent-003

`--no-verify` or config `verify_before_complete=false` SHALL skip the gate (`verify_skipped=true`). Cancellation via AbortSignal SHALL abort promptly (AGENT-3).

Acceptance Criteria
- Skip path never calls verify runner; `verified=false`, `verify_skipped=true`.
- Aborted signal during/before verify returns `cancelled=true`.


### REQ-agent-004

During Planning, `runTask` SHALL load relevant module specs via SpecSync list/read (Merlin `spec_loader` pattern): token-overlap select top modules from the task text, extract Purpose/Invariants/Public API/Error Cases, and include companion briefing files when present (SPECSYNC-1/5). Soft-fail if registry or SpecSync tooling is unavailable.

Acceptance Criteria
- Task text mentioning a registered module produces Planning `Text` that includes `# Spec: <module>`.
- Companion files (`context.md`, `tasks.md`, …) appear in the briefing when present on disk.
- Missing registry does not fail the task; Planning continues.

### REQ-agent-005

Prove-before-done verify lane SHALL include SpecSync check (`spec-check` on `lanes.verify`) so SpecSync check failures block `verified=true` (SPECSYNC-2/7). CI Spec Sync Action remains a separate workflow.

Acceptance Criteria
- `fledge.toml` `[lanes.verify]` steps include `spec-check`.
- Default verify runner argv stays `lanes run verify --non-interactive` (spec-check runs inside the lane).


### REQ-agent-006

The agent module SHALL export `buildCorvidinhoArgv(bin, args)` that returns
`["bun", bin, ...args]` when `bin` ends with `.ts`, else `[bin, ...args]`.
Callers that spawn the Corvidinho entrypoint (protocol handshake, Discord/WATCH
agent clients) SHALL use this helper so `.ts` is never posix_spawned alone.

Acceptance Criteria
- Unit tests cover `.ts` and non-`.ts` argv shapes.

### REQ-agent-007

The execute hook for `task run` SHALL call an OpenAI-compatible chat completions endpoint when `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`), and SHALL keep the demo execute stub (synthetic filesChanged for the verify-gate exercise) when no key is set. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover no-key path; key path mocks fetch (no live API in CI).

### REQ-agent-008

The system SHALL run an interruptible OpenAI-compatible tool loop when an LLM API key is set and the capability tier is `tool` or `code`: it SHALL expose non-dangerous registered plugins as `tools`, SHALL dispatch `tool_calls` via `runPlugin` under SAFE-1 non-interactive deny unless allowlisted, SHALL emit `ToolCall` and `ToolResult` events, SHALL stop promptly on AbortSignal (AGENT-3), and SHALL collect `filesChanged` only when a tool result reports them so prove-before-done stays honest (AGENT-4).

Acceptance Criteria
- Mock HTTP fixture: tool_call → plugin runs → final text summary.
- Dangerous plugin without allowlist → ToolResult success=false under non-interactive.
- Aborted signal mid-loop returns without claiming success completion of further rounds.
- filesChanged empty unless a tool payload includes filesChanged.

### REQ-agent-009

The system SHALL accept capability tier `read|tool|code` via `--tier` or `CORVIDINHO_LLM_TIER` (default `tool`) so read-shaped work gets no tools and tool/code tiers filter plugins by `minTier` (AGENT-5). The default tool catalog SHALL omit dangerous plugins; runtime SAFE-1 SHALL still apply when dangerous tools are included.

Acceptance Criteria
- read → no tools in chat request.
- tool/code → buildOpenAiTools filters by minTier; dangerous omitted by default.

### REQ-agent-010

The tool-loop system prompt SHALL instruct the model to (a) trust the injected
memory block, (b) call `memory-store` when the user states durable
identity/person/project facts, (c) call `memory-recall` before claiming
ignorance about the user/people/projects, (d) never invent memories
(AGENT-7 / MEMORY-2/4; draft #67 behavior).

Acceptance Criteria
- `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` exported and embedded in tool-loop system.
- Fixture asserts trust / store / recall / never-invent phrases + argv example.

### REQ-agent-128

The LLM tool loop SHALL only dispatch tool calls whose name is in the catalog
offered for the current run (capability tier and danger filtered, AGENT-5).
Any other registered plugin name requested by the model SHALL be answered with
a refused tool result and SHALL NOT be executed, regardless of interactive
mode or allowlist (SAFE-1).

Acceptance Criteria
- A registered dangerous plugin not in the offered catalog is refused, not run, even interactive and allowlisted.
- Offered tools still run through `runPlugin` with SAFE-1 gating unchanged.

### REQ-agent-133

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

### REQ-agent-073

The agent SHALL provide a versioned NDJSON event stream contract in
`src/agent/events-ndjson.ts` so bridges can see what state a run is in while it
works (AGENT-8). The module SHALL own `CORVIDINHO_PROTOCOL_VERSION` (now `2`)
and every frame SHALL carry it as `protocol`. Frames SHALL be one per
`AgentEvent` using the AgentEvent type names (`StateChanged`, `Text`,
`ToolCall`, `ToolResult`, `VerifyResult`) plus stream-only `usage` (running
`promptTokens` / `completionTokens` / `totalTokens`) and a final `result`
frame whose `result` is the `TaskResult`. `ToolCall` frames SHALL carry the
plugin command `name` and a truncated, secret-scrubbed `argsSummary` and SHALL
never carry the raw tool arguments (SAFE-6). Text, ToolResult detail and
VerifyResult output SHALL be secret-scrubbed and length-capped. A parser SHALL
turn stdout chunks into frames, tolerating partial lines split across chunks,
blank lines, garbage, JSON without `protocol`, unknown types, wrong field
types, and an unterminated final line. `createTaskExecute` SHALL report
running token totals through `onUsage` when the OpenAI-compatible response
carries `usage`; `AgentEvent` itself stays unchanged.

Acceptance Criteria
- Each AgentEvent serializes to one line with `protocol` and its AgentEvent `type`.
- ToolCall frame never contains the raw args; sensitive keys print `[redacted]`, vendor-key shapes are scrubbed, values and the summary are truncated.
- Unparseable tool args are summarized by length only.
- Parser returns frames across split chunks and ignores garbage / unversioned / malformed lines.
- `readNdjsonStream` returns the result frame and the non-frame text for fallback.
- `progressFromFrame` maps states to planning / working / verifying / done / failed, ToolCall to the current tool, and usage to token totals.
- Mocked fetch with `usage` over two rounds yields running totals via `onUsage` (no network).

### REQ-agent-084

When `task run` executes, the execute hook SHALL read `AGENTS.md` and
`CLAUDE.md` from the project root (the nearest directory at or above the run
cwd that contains `.git`, else the cwd) and SHALL include them in the
read-tier and tool-loop system prompts, labelled as project instructions that
cannot widen SAFE-1 consent, the tool allowlist or the capability tier
(AGENT-1). It SHALL NOT read instruction files from directories above the
project root. Each file SHALL be capped at 16 KiB with a truncation marker. A
symlink that resolves outside the project root, a non-regular file, and
binary or non-UTF-8 content SHALL be refused; missing files SHALL be skipped;
the loader SHALL never fail the run. Instruction text SHALL be SAFE-6
scrubbed before it reaches a provider. One `Text` event SHALL name the files
that were loaded, truncated, deduplicated or refused.

Acceptance Criteria
- A project AGENTS.md / CLAUDE.md appears in the read-tier and tool-loop system prompt under the project-instructions label on every attempt.
- An AGENTS.md in a parent directory outside the project is never read.
- A file over 16 KiB is cut on a UTF-8 boundary with a truncation marker.
- A symlink resolving outside the project, a broken symlink, a directory, binary and non-UTF-8 files are refused; missing files are skipped.
- CLAUDE.md symlinked to AGENTS.md is reported as a duplicate and rendered once.
- Secret-shaped text in an instruction file is redacted.
- `projectInstructions: false` or no files leaves the system prompt unchanged.

