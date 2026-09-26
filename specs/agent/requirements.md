# Agent — requirements

See agent.spec.md REQ-agent-001..003 via SpecSync change deltas.

### REQ-agent-001

The system SHALL expose task states idle, planning, executing, verifying, done, and failed (AGENT-8).

Acceptance Criteria
- `runTask` emits `StateChanged` for planning → executing → verifying → done|failed.
- `TaskResult` includes `state` reflecting the terminal state.

### REQ-agent-002

When `verify_before_complete` is enabled and the run changed files — the
execute step reports files changed, or the real worktree changed since the run
began (REQ-agent-085) — completion SHALL run `fledge lanes run verify
--non-interactive`. Pass → `verified=true`. Fail with retries remaining →
re-enter executing with verifier output. Exhausted retries → terminal failure
with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2).

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- A worktree delta with no tool-reported `filesChanged` still runs the verify lane.

### REQ-agent-003

`--no-verify` or config `verify_before_complete=false` SHALL skip the gate
(`verify_skipped=true`); this is an operator-only escape hatch — Discord and
WATCH spawns SHALL NOT pass `--no-verify`. A skipped run that changed files
SHALL lead its summary with the plain `NOT verified: …` line so it never reads
as a verified done (AGENT-4). Cancellation via AbortSignal SHALL abort promptly
(AGENT-3).

Acceptance Criteria
- Skip path never calls verify runner; `verified=false`, `verify_skipped=true`.
- Skip path with a change leads the summary with `NOT verified:`.
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

### REQ-agent-085

`runTask` SHALL decide whether a run changed anything from both the
tool-reported `filesChanged` and the real worktree: it SHALL fingerprint the
worktree containing `cwd` before the first execute (HEAD, `git status
--porcelain` including untracked files, and a content fingerprint of each
listed path) and, after each execute, SHALL treat any path whose status or
content differs, that vanished, or that changed between the two HEADs as a
change. Any change SHALL trigger the verify lane when the gate is on; the
worktree probe SHALL only add a reason to verify and SHALL never skip a
verification a tool report asked for. When `cwd` is not in a worktree, git is
missing, or the probe fails, the tool report alone SHALL decide. The probe
SHALL ignore `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` from the parent env
and SHALL NOT take `index.lock`. Every non-cancelled `TaskResult.summary` SHALL
carry exactly one fixed plain verification line, never built from model or
lane output (AGENT-4): leading `Verified: …` when the lane passed, leading
`Verification FAILED: the project verify lane did not pass after N retries — not
done.` when retries are exhausted, leading `NOT verified: …` when the gate is
off and the run changed files, and trailing `No files changed — nothing to
verify.` when nothing changed. `describeFailedRun` SHALL return
`failed (exit N)` plus the FAILED line rebuilt from the template when a failed
run's summary carries it.

Acceptance Criteria
- Temp repo: a file written without any `filesChanged` report runs the verify lane and the summary leads with `Verified:`.
- Already-dirty file edited again, committed work (clean status, moved HEAD), and a subdirectory cwd are all detected.
- Clean chat run: no verify call; summary ends with `No files changed — nothing to verify.`
- Exhausted retries lead with the FAILED line and keep the lane output; gate off with a change leads with `NOT verified:`.
- Non-worktree cwd, failing git runner, or throwing probe fall back to tool reports.
- `GIT_DIR` set in the parent env does not redirect the probe.
- `describeFailedRun` rebuilds the FAILED line and ignores near-miss text.

