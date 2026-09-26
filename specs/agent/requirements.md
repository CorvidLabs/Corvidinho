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

### REQ-agent-098

The agent SHALL enforce an optional operator-set daily spend cap on provider
(LLM) calls (SAFE-8, as amended on #98: warn at 80%, ask at 100%) in
`src/agent/spend.ts`. The cap SHALL be read from
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling 24-hour
window. When it is unset or blank, the capped fetch SHALL be the provider
fetch unchanged and the database SHALL NOT be opened, so behavior is
unchanged. When it is set, `createTaskExecute` SHALL send every
OpenAI-compatible call through the capped fetch, which SHALL price the call
from a per-model table (standard USD per 1M input/output tokens, exact model
id match), estimate it from the request size plus a fixed reply reserve, and,
in one IMMEDIATE transaction on the shared SQLite `spend_ledger` table,
reserve the estimate unless spend in the last 24 hours plus the estimate
would exceed the cap. After the reply, the reservation SHALL be settled to
the provider-reported token usage cost; it SHALL stay at the estimate when
usage is missing or the request failed at the network, and SHALL count zero
when the provider returned an HTTP error.

At 100%, a call whose estimate would exceed the cap SHALL NOT be sent.
Instead the attempt SHALL end with `ask: {reason: "spend-cap", question}`
whose question states the 24-hour spend, the call estimate and the cap and
says how to continue (raise or unset the cap and ask again, or wait for
earlier spend to leave the window), and `runTask` SHALL return state
`blocked` (never `done`, verify not run, no retry) through the AUTONOMY-1/2
ask path. A model with no known price, a cap value that is not a plain USD
amount (never echoed), or an unavailable ledger SHALL end the attempt the
same way (never counted as free, fail closed). The runner SHALL NOT send a
provider call past the cap.

At 80%, after a call settles, when 24-hour spend is at or above 80% of the
cap and no warning for that cap value was recorded in the last 24 hours, the
module SHALL record one in the module-owned `spend_alerts` table within one
IMMEDIATE transaction (so concurrent processes warn once between them), emit
one `Text` event naming the spend, the cap and the percent, report it through
`onSpendWarning`, and `TaskResult.spendWarning` SHALL carry the integer
amounts. The module SHALL also report spend against the cap for doctor and
Discord `/status` (AUTONOMOUS-8). The Approve card (#96, draft SAFE-18..20)
and draft SAFE-14..16 are not part of this requirement.

Acceptance Criteria
- No cap: the capped fetch is the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): no fetch; the attempt returns a `spend-cap` ask naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`; `runTask` returns `blocked` with verify skipped; `task run --json` exits 0 with `result.ask.reason` `spend-cap`.
- Spend older than 24 hours no longer counts.
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls and runs in the same 24 hours at the same cap do not; a new cap value re-arms it; `task run --json` carries `result.spendWarning` on the crossing run.
### REQ-agent-117

Autonomous mode SHALL be off until the project enables it in project config
(AUTONOMOUS-1). `src/autonomous/enabled.ts` SHALL read `<cwd>/fledge.toml` and
treat autonomous mode as enabled only when the key
`corvidinho.autonomous.enabled` (table `[corvidinho.autonomous]` or the dotted
key under `[corvidinho]`) is the literal `true`. A missing file, section or
key, any other value, an inline table, or a key under a later `[table]` /
`[[array]]` header SHALL be off.

The task-run tool loop SHALL offer autonomous extras (plugins declaring
`autonomous: true`, such as `delegate`) only when the session is allowed:
autonomous mode is enabled for the run's cwd and the delegation depth
(`CORVIDINHO_DELEGATE_DEPTH`; unset is 0, a malformed value is treated as the
cap) is below 2. Otherwise they SHALL be absent from the catalog at every tier
(SAFE-9), and a model naming them SHALL get the REQ-agent-128 refusal. The
loop SHALL pass its capability tier and abort signal to `runPlugin`.

The delegation core (`src/autonomous/delegate.ts`) SHALL run a worker as
`task run --non-interactive --tier <t> --output ndjson --task <text>`
through `buildCorvidinhoArgv` (so a `.ts` bin runs as `bun --no-env-file`), with
the `--task` value last and never `--no-verify` (REQ-cli-085): a worker keeps
the project's prove-before-done gate (AGENT-4) and reports its `verified` /
`verifySkipped` outcome. The worker bin SHALL be `CORVIDINHO_BIN` when set,
else this checkout's `src/cli.ts`, never the cwd's. The worker tier SHALL be
the requested tier clamped to the lead's; an omitted tier SHALL mean the
lead's tier and an unknown tier SHALL be refused. The worker env SHALL be
the lead's env without `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`,
`CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key (SAFE-6; LLM
provider keys stay), and SHALL force the depth to the lead's depth + 1,
`CORVIDINHO_LLM_TIER` to the worker tier, `CORVIDINHO_NON_INTERACTIVE=1` and
`CORVIDINHO_ALLOWLIST` to the lead's effective allowlist, overriding inherited
values, so a worker never inherits ADMIN or human SAFE-4 confirm tokens. When
the lead runs in a ROLES-CHAT role session (`CORVIDINHO_ACTING_IS_ADMIN` set)
the worker env SHALL set `CORVIDINHO_ACTING_IS_ADMIN=0`, making the worker a
non-ADMIN session with read/chat tools only (ROLES-CHAT-2/3); a lead outside a
role session (local CLI) SHALL get a worker outside one. At most 2
workers SHALL run at once and at most 4 SHALL start per lead process; beyond
that the call is refused, not queued. A worker SHALL be stopped on lead abort
(AGENT-3), after a 10 minute timeout, or when the lead process exits, and the
lead SHALL NOT wait on a worker pipe held open by a grandchild beyond a short
drain after the worker exits. The worker summary returned to the lead SHALL be
SAFE-6 scrubbed and capped. The depth, tier and fan-out limits are safety
defaults; draft AUTONOMOUS-10 is not an acceptance criterion and stays left
for HI capture.

Acceptance Criteria
- Only `[corvidinho.autonomous] enabled = true` (or the dotted key) turns autonomous mode on; string / number / inline-table / later-table values and a missing file are off; this repo's `fledge.toml` ships off.
- `buildOpenAiTools` omits `delegate` unless `autonomous: true`, and offers it at code tier only.
- `createTaskExecute` in a temp project with autonomous enabled at code tier offers `delegate`; a disabled project, tool tier, or depth 2 does not; a model call to a hidden `delegate` is refused, not run.
- A lead tool loop that calls `delegate` against a fake bin receives the worker summary in the tool message, and the worker's filesChanged join the lead's result.
- Depth parse fails closed; tier clamp never exceeds the lead; spawn argv uses `bun --no-env-file` with `--task` last and no `--no-verify` flag; forced worker env overrides inherited env; the limiter refuses past 2 concurrent / 4 per run.
- The worker env (and the spawned worker process) has no `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` or inherited `CORVIDINHO_ACTING_*` key and keeps LLM provider keys; a role-session lead gets `CORVIDINHO_ACTING_IS_ADMIN=0`, a CLI lead none.
- A non-ADMIN role session's catalog leaves out `delegate` even when autonomous mode is allowed; the ADMIN owner's catalog offers it (ROLES-CHAT-2/4).
- Worker timeout, lead abort, and a grandchild holding the pipe do not hang the lead; a `.env` in the cwd is not loaded by a `.ts` worker.

### REQ-agent-084

When `task run` executes, the execute hook SHALL read `AGENTS.md` and
`CLAUDE.md` from the project root (the nearest directory at or above the run
cwd that contains `.git`, else the cwd) and SHALL include them in the
read-tier and tool-loop system prompts, labelled as project instructions that
cannot widen SAFE-1 consent, the tool allowlist or the capability tier
(AGENT-1). It SHALL NOT read instruction files from directories above the
project root. When the project root contains `.git`, the loader SHALL read
only the copy committed at `HEAD`, through read-only git with hooks off and
repository discovery clamped to the root: a working-tree edit or an
instruction file that is not committed SHALL NOT reach the system prompt
(the non-dangerous file tools can change the working tree without consent;
changing `HEAD` needs a consented dangerous tool, SAFE-1). An uncommitted
instruction file SHALL be refused as not committed, a `.git` that git cannot
read SHALL refuse the files that are present rather than fall back to the
working tree, and a committed symlink SHALL be followed only as a path
inside the commit. Without `.git` the working-tree file SHALL be read. Each
file SHALL be capped at 16 KiB with a truncation marker. A symlink that
resolves outside the project root, a non-regular file, and binary or
non-UTF-8 content SHALL be refused; missing files SHALL be skipped; the
loader SHALL never fail the run. Instruction text SHALL be SAFE-6 scrubbed
before it reaches a provider. When a file was refused or truncated, or its
working-tree copy differs from `HEAD`, one `Text` event SHALL name the files
that were loaded, truncated, deduplicated or refused and say that
working-tree changes were not loaded; a clean load SHALL add no event, so an
ordinary run's event stream is unchanged.

Acceptance Criteria
- A project AGENTS.md / CLAUDE.md appears in the read-tier and tool-loop system prompt under the project-instructions label on every attempt.
- An AGENTS.md in a parent directory outside the project is never read.
- In a git project, AGENTS.md overwritten by files-write after the last commit does not reach the system prompt: the committed text is loaded and one `Text` note says working-tree changes were not loaded; after a commit the new text is loaded with no note.
- In a git project, an untracked AGENTS.md / CLAUDE.md (or any file under an unborn HEAD) is refused as not committed.
- A `.git` that git cannot use refuses present instruction files; the working-tree copy is not loaded.
- A git worktree (session worktree) reads its own HEAD.
- A file over 16 KiB is cut on a UTF-8 boundary with a truncation marker.
- A symlink resolving outside the project, a broken symlink, a symlinked directory hop (committed), a symlink loop (committed), a directory, binary and non-UTF-8 files are refused; missing files are skipped.
- CLAUDE.md symlinked to AGENTS.md is reported as a duplicate and rendered once.
- Secret-shaped text in an instruction file is redacted.
- `projectInstructions: false` or no files leaves the system prompt unchanged.
- A clean load adds no event; a refused, truncated or uncommitted-change file yields exactly one `Text` note across attempts.

### REQ-agent-112

When a task run's catalog may include dangerous tools (`includeDangerous`),
`createTaskExecute` SHALL load the project's Fledge plugins (cwd = task cwd,
env = run env) before building the tool catalog, so Fledge commands can be
offered and called as tools under the usual tier filter, catalog-only
dispatch and SAFE-1 allowlist (FLEDGE-4). The default catalog (dangerous
omitted) SHALL NOT spawn fledge. `buildOpenAiTools` SHALL build each tool with
the exported `toolDefForEntry`, which is also what the schema-cost view
measures (FLEDGE-5); the tool definitions sent are unchanged.

Acceptance Criteria
- includeDangerous + code tier + allowlist: the first request offers `fledge-hello`; the model's call runs the fake fledge and the ToolResult succeeds with the plugin output.
- Default catalog: no `fledge-*` tool is offered and none is registered.
- Existing tool-loop tests pass unchanged.

### REQ-agent-roles-001

When building the tool catalog for an acting session, non-ADMIN SHALL not
receive mutating tools (including files-write/edit).

Acceptance Criteria
- `tests/roles.chat.gates.test.ts` catalog assertions for non-admin vs admin.

### REQ-agent-044

The tool loop SHALL offer an agent-level `ask-human` tool (argument
`question`) on tool/code tiers alongside the plugin catalog, and its system
prompt SHALL tell the model to call it when the task cannot proceed without a
human choice instead of guessing, inventing acceptance criteria, or claiming
done (AUTONOMY-1). The call SHALL NOT be dispatched as a plugin: a non-empty
question SHALL end the execute attempt with `ask: {reason: "clarify",
question}` and summary `Needs your input: <question>`; an empty question
SHALL be refused back to the model as a failed tool result.

`runTask` SHALL return state `blocked` (never `done`, verify not run,
`verifySkipped: true`) with the same `ask` when execute returns one, and SHALL
emit `StateChanged blocked`. When verification still fails after every retry,
the result SHALL stay `failed` (AGENT-4) and SHALL carry `ask: {reason:
"stuck", question}` with the question appended to the summary (AUTONOMY-2).
`TaskResult.ask` rides the existing `--json` / NDJSON `result`; `blocked` is a
valid NDJSON StateChanged value. The change is additive and the wire protocol
stays 2.

Acceptance Criteria
- ask-human is in the provider tool list on tool/code tiers, once, and never on the read tier.
- Calling ask-human ends the run with state `blocked`, `ask.reason` `clarify`, and no plugin dispatch.
- An empty question is refused to the model and the loop continues.
- Questions are trimmed, control characters dropped, capped at 1500 chars.
- Verify exhaustion stays `failed` and carries a `stuck` ask.
- `task run` text prints the question; `--json` / ndjson carry `result.ask`; blocked exits 0.

