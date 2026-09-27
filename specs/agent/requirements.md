# Agent — requirements

See agent.spec.md REQ-agent-001..003 via SpecSync change deltas.

### REQ-agent-001

The system SHALL expose task states idle, planning, executing, verifying, done, and failed (AGENT-8).

Acceptance Criteria
- `runTask` emits `StateChanged` for planning → executing → verifying → done|failed.
- `TaskResult` includes `state` reflecting the terminal state.

### REQ-agent-002

When `verify_before_complete` is enabled and the run changed files (reported by a tool, or in the run's real git working-tree diff per REQ-agent-085), completion SHALL run `fledge lanes run verify --non-interactive`. Pass → `verified=true`. Fail with retries remaining → re-enter executing with verifier output. Exhausted retries → terminal failure with `verified=false` (AGENT-4 / AGENT-4.a / FLEDGE-2). The default runner SHALL spawn fledge with the parent's env minus the delegate worker drop list (`DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key) and the LLM API keys (`CORVIDINHO_LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`), keeping every other inherited key, so tests the agent wrote never see operator secrets (SAFE-6). The verifier output a retry gets SHALL be the failing step's, not the start of the lane log (AGENT-4.a): output within `VERIFY_FEEDBACK_MAX_CHARS` (4000) is passed whole; over it, `verifyFeedbackExcerpt` SHALL drop colour escapes, name the failing step (from fledge's `Lane '<lane>' failed at step N (<name>)` line; a parallel step is `parallel(<tasks>)`) and keep that step's output from its `Running task: <name>` marker (a parallel step's from its `Running parallel:` line) when it fits, else its error / fail lines (lines that report a failure, such as `error:`, `Expected:`, `(fail)` or `file(1,2): error TS…`, before lines that only mention one; first ones first; passing-test lines left out; printed in log order) and the end of the log, in at most 4000 chars and never cut inside a surrogate pair. `runTask` SHALL keep the feedback it passes as `ExecuteContext.verifyFeedback` (its "Verification failed" head included) within that cap, and the LLM execute (tool loop and read-tier chat) SHALL cap verify feedback with the same excerpt, never by keeping its first 4000 chars. No flag, environment variable or config key is added.

Acceptance Criteria
- Mock verify fail then pass within max_retries yields `verified=true` and a second execute call that receives feedback.
- Exhausted retries yield `verified=false` and failed state.
- Default runner invokes fledge with `lanes run verify --non-interactive`.
- An attempt whose execute result reports no files but that changed the git working tree (REQ-agent-085) runs verify: done with `verified=true` only on a pass, otherwise retried and then failed.
- A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` set runs the default runner: the fledge child's env has none of those keys or values and keeps the rest (PATH, HOME, `CORVIDINHO_DATA_DIR`, other keys).
- A failing lane log whose passing steps (lint, a `--help` smoke over 4000 chars) come before a failing `test` step gives the retry's `verifyFeedback` and the tool loop's next request at most 4000 chars that name `Failing step: test (step 3 of lane 'verify')` and carry the failing test's error lines and fledge's failure line, not the `--help` text (AGENT-4.a).
- A failing step whose own output is over the cap keeps its first error lines and the end of the log (the last failure, the test summary, fledge's failure line); passing-test lines are not kept as error lines.
- A raw verify feedback over the cap passed to the read-tier chat is cut to the failing step and the end of the log, not its first 4000 chars.
- Verify output within the cap reaches the retry and the model whole, as before.
- The excerpt is never longer than its cap and never holds half a surrogate pair.
- Console chatter in the failing step that only mentions a failure (`… marked failed`, `error_class=ok`, as Corvidinho's own tests log on stdout before bun's stderr report) does not crowd out that step's `error:`, `Expected:` / `Received:` and `(fail)` lines.
- Colour escapes (FORCE_COLOR reaching the lane) are dropped from an over-cap log and hide neither fledge's markers nor passing-test lines; a failing parallel step is named `parallel(<tasks>)` and kept from its `Running parallel:` line; a log with no fledge markers is not called a failing step's output.

### REQ-agent-003

`--no-verify` or config `verify_before_complete=false` SHALL skip the gate (`verify_skipped=true`). Cancellation via AbortSignal SHALL abort promptly (AGENT-3).

Acceptance Criteria
- Skip path never calls verify runner; `verified=false`, `verify_skipped=true`.
- Aborted signal during/before verify returns `cancelled=true`.


### REQ-agent-004

During Planning, `runTask` SHALL load relevant module specs via SpecSync list/read (Merlin `spec_loader` pattern): token-overlap select top modules from the task text, extract Purpose/Invariants/Public API/Error Cases, and include companion briefing files when present (SPECSYNC-1/5). Selection SHALL use the request, not the context a bridge wraps around it: paragraphs that open with a `[Corvidinho …]` header (the Discord identity and memory blocks) and all-caps line labels such as `[WATCH <kind>]` are left out of the token overlap. Soft-fail if registry or SpecSync tooling is unavailable. The loaded briefing SHALL reach the model, not only the Planning `Text` event (AGENT-2): `runTask` SHALL pass it as `ExecuteContext.specBriefing` on every execute attempt (including verify retries), and the LLM execute (tool loop and read-tier chat) SHALL add it to the user message after the task text, labelled as project data that cannot widen SAFE-1 consent, the tool allowlist or the capability tier, fenced in `<specsync-briefing>` so the spec text cannot close its own label (a close tag in any case or spacing is escaped), SAFE-6 scrubbed, and capped at 8000 characters with a truncation marker, never ending on half a surrogate pair. The briefing SHALL NOT be placed in the system prompt (spec files come from the working tree). With no briefing the messages sent to the model are unchanged.

Acceptance Criteria
- Task text mentioning a registered module produces Planning `Text` that includes `# Spec: <module>`.
- Companion files (`context.md`, `tasks.md`, …) appear in the briefing when present on disk.
- Missing registry does not fail the task; Planning continues.
- With an LLM key, the user message sent to the model (tool and read tier) contains the matched module's Invariants and companion text inside the labelled `<specsync-briefing>` fence; the system message does not.
- Every execute attempt, including verify retries, receives `specBriefing`; a task that matches no module receives none and its user message is unchanged.
- Vendor-key-shaped values in the briefing are redacted, a `</specsync-briefing>` inside a spec cannot end the fence, and briefing text over 8000 characters is truncated with a marker.
- A Discord chat whose request names no module gets no briefing although its identity and memory blocks say "Discord"; a `[WATCH <kind>]` run gets no `watch` briefing from its header; a request that names a module still gets that module's briefing.
- A spaced or mixed-case close tag (`</ specsync-briefing >`) in a spec cannot end the fence, and the 8000-character cut leaves no lone surrogate.

### REQ-agent-005

Prove-before-done verify lane SHALL include SpecSync check (`spec-check` on `lanes.verify`) so SpecSync check failures block `verified=true` (SPECSYNC-2/7). CI Spec Sync Action remains a separate workflow.

The `spec-check` task SHALL run `specsync check` at the CI Spec Sync Action's strictness: `--require-coverage` equal to the Action's `require-coverage` input in `.github/workflows/spec-sync.yml`, and `--strict` only when the Action sets `strict`. A tree the CI Spec Sync check rejects SHALL NOT reach `verified=true` locally (SPECSYNC-2).

Acceptance Criteria
- `fledge.toml` `[lanes.verify]` steps include `spec-check`.
- Default verify runner argv stays `lanes run verify --non-interactive` (spec-check runs inside the lane).
- `fledge.toml` `[tasks.spec-check]` is `specsync check --require-coverage 100` while `spec-sync.yml` sets `require-coverage: "100"` and `strict: false`; a test fails when the two disagree (coverage value, `--strict` present iff `strict` is true, or an Action input the check does not know).
- A source file under a SpecSync source dir with no spec coverage makes `fledge run spec-check` (and so the verify lane) exit non-zero, naming the file.

### REQ-agent-006

The agent module SHALL export `buildCorvidinhoArgv(bin, args)` that returns
`["bun", bin, ...args]` when `bin` ends with `.ts`, else `[bin, ...args]`.
Callers that spawn the Corvidinho entrypoint (protocol handshake, Discord/WATCH
agent clients) SHALL use this helper so `.ts` is never posix_spawned alone.

Acceptance Criteria
- Unit tests cover `.ts` and non-`.ts` argv shapes.

### REQ-agent-007

The execute hook for `task run` SHALL call an OpenAI-compatible chat completions endpoint when `CORVIDINHO_LLM_API_KEY` or `OPENAI_API_KEY` is set (`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`, with the model chosen for the run's capability tier per REQ-agent-079), and SHALL keep the demo execute stub (synthetic filesChanged for the verify-gate exercise) when no key is set. Secrets SHALL stay in env and SHALL never be committed.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat completions path (tool loop or read-tier chat per REQ-agent-008/009).
- Fixture tests cover no-key path; key path mocks fetch (no live API in CI).
- Key present → every request's `model` is the run tier's model (REQ-agent-079); with no per-tier model key it is `CORVIDINHO_LLM_MODEL` (default `gpt-4o-mini`) as before.

### REQ-agent-008

The system SHALL run an interruptible OpenAI-compatible tool loop when an LLM API key is set and the capability tier is `tool` or `code`: it SHALL expose non-dangerous registered plugins as `tools`, SHALL dispatch `tool_calls` via `runPlugin` under SAFE-1 non-interactive deny unless allowlisted, SHALL emit `ToolCall` and `ToolResult` events, SHALL stop promptly on AbortSignal (AGENT-3), and SHALL collect the execute result's `filesChanged` only when a tool result reports them so prove-before-done stays honest (AGENT-4). Tool-reported `filesChanged` is a lower bound for the verify gate, not the whole of it: `runTask` also adds the run's real git working-tree diff (REQ-agent-085).

Acceptance Criteria
- Mock HTTP fixture: tool_call → plugin runs → final text summary.
- Dangerous plugin without allowlist → ToolResult success=false under non-interactive.
- Aborted signal mid-loop returns without claiming success completion of further rounds.
- The execute result's filesChanged is empty unless a tool payload includes filesChanged.
- A code-tier `shell-exec` edit (its payload has no filesChanged) still reaches the verify gate through the real diff: `runTask` runs verify and never ends done on a failed lane (REQ-agent-085).

### REQ-agent-009

The system SHALL accept capability tier `read|tool|code` via `--tier` or `CORVIDINHO_LLM_TIER` (default `tool`) so read-shaped work gets no tools and tool/code tiers filter plugins by `minTier` (AGENT-5). The default tool catalog SHALL omit dangerous plugins; runtime SAFE-1 SHALL still apply when dangerous tools are included. The effective tier (`--tier` over `CORVIDINHO_LLM_TIER`) SHALL also select the model the run calls (REQ-agent-079), so read-shaped work can stay on a cheaper model than tool and code work.

Acceptance Criteria
- read → no tools in chat request.
- tool/code → buildOpenAiTools filters by minTier; dangerous omitted by default.
- A read run sends the read model and a code run the code model; the `--tier` / `createTaskExecute` `tier` override, not `CORVIDINHO_LLM_TIER`, picks it.

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
protocol handshake), it SHALL invoke `bun --no-env-file --config=/dev/null <bin>`
so `.env*` files in the spawn cwd (a project worktree) are never loaded into
the agent and Bun config (including `bunfig.toml` `preload`) is never read from
the spawn cwd; the child's Bun config is pinned to a known-empty file. Agent
configuration (allowlists, admin lists, keys) SHALL come only from the
environment the parent passes (ALLOW-4 / SAFE-1). Fixture tests SHALL use
temporary project roots so test runs create no worktrees or branches in the
repository (SESSION-WORKTREE-3 hygiene).

Acceptance Criteria
- `.ts` spawn argv is `bun --no-env-file --config=/dev/null <bin> ...`; non-`.ts` bins unchanged.
- A `.env` in the spawn cwd does not reach the child.
- A `bunfig.toml` `preload` in the spawn cwd never runs in the child.
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
`CORVIDINHO_DAILY_SPEND_CAP_USD` as a plain USD amount over a rolling
24-hour window. When it is unset or blank, the capped fetch SHALL be the
provider fetch unchanged and the database SHALL NOT be opened, so behavior
is unchanged. When it is set, `createTaskExecute` SHALL send every
OpenAI-compatible call through the capped fetch, which SHALL price the call
from a per-model table (standard USD per 1M input/output tokens, exact model
id match), estimate it from the request size plus a fixed reply reserve,
and, in one IMMEDIATE transaction on the shared SQLite `spend_ledger` table,
reserve the estimate unless spend in the last 24 hours plus the estimate
would exceed the cap. After the reply, the reservation SHALL be settled to
the provider-reported token usage cost; it SHALL stay at the estimate when
usage is missing or the request failed at the network, and SHALL count zero
when the provider returned an HTTP error.

At 100%, a call whose estimate would exceed the cap SHALL NOT be sent.
Instead the attempt SHALL end with `ask: {reason: "spend-cap", question}`
whose question states the 24-hour spend, the call estimate and the cap,
names the operator action that continues (raise or unset the cap where
Corvidinho runs and restart, or wait for earlier spend to leave the window,
then ask again) and says a reply cannot lift the cap, without a yes/no
question; the attempt's summary SHALL be the generic `SPEND_CAP_SUMMARY`
with no amounts and no env names (safe for a public reply such as a WATCH
comment), and `runTask` SHALL return state `blocked` (never `done`, verify
not run, no retry) through the AUTONOMY-1/2 ask path. A model with no known
price, a cap value that is not a plain USD amount (never echoed), or an
unavailable ledger SHALL end the attempt the same way (never counted as
free, fail closed). The runner SHALL NOT send a provider call past the cap.

At 80%, after a call settles, when 24-hour spend is at or above 80% of the
cap and the warning for that cap value is armed, the module SHALL record one
pending warning in the module-owned `spend_alerts` table
(`src/agent/spend-alerts.ts`) within one IMMEDIATE transaction (so
concurrent processes warn once between them), emit one `Text` event naming
the spend, the cap and the percent, report it through `onSpendWarning`, and
`TaskResult.spendWarning` SHALL carry the integer amounts. The warning SHALL
be armed once per crossing: it disarms when recorded and re-arms when a
settle or a later reservation sees spend under 70% of that cap value, 24
hours after the last warning, or for a new cap value. Recording SHALL be
separate from delivery: a recorded warning SHALL stay pending until a
surface that can reach the owner claims it (`src/agent/spend-outbox.ts`
`createSpendAlertOutbox`: `takeWarning` claims every pending warning of the
last 24 hours in one IMMEDIATE transaction and returns current spend against
the recorded cap; while spend is back under 80% of that cap it SHALL claim
nothing and leave the warning pending — the crossing stays disarmed, so no
second warning is recorded — for the first post that sees 80% or more;
`release` returns a claimed warning when the post failed; `claimCapPing`
allows one owner ping per cap episode, re-armed the same way, and returns a
claim whose `release` hands the ping back when the post that carried it
failed). The module SHALL also report spend against the cap for doctor and
Discord `/status` (AUTONOMOUS-8). The Approve card (#96, draft SAFE-18..20)
and draft SAFE-14..16 are not part of this requirement.

Acceptance Criteria
- No cap: the capped fetch is the same fetch and no database file is created.
- Under the cap: the call is sent, the caller can still read the reply, and the ledger row settles to the usage cost in integer micro-USD.
- Spend plus estimate over the cap (including a zero cap): no fetch; the attempt returns a `spend-cap` ask naming spend, estimate, cap and `CORVIDINHO_DAILY_SPEND_CAP_USD`, ending with the operator action and no question mark; the summary is `SPEND_CAP_SUMMARY` (no `$`, no `CORVIDINHO_`); `runTask` returns `blocked` with verify skipped; `task run --json` exits 0 with `result.ask.reason` `spend-cap`.
- Spend older than 24 hours no longer counts.
- Unpriced model, invalid cap value or unavailable ledger: no fetch and a `spend-cap` ask; the invalid value and secret-shaped model ids are not echoed.
- HTTP error reply counts 0; missing usage and network errors keep the estimate.
- Two connections on one DB file see each other's reservations and record the 80% warning once between them.
- The call that brings spend to 80% yields exactly one `Text` warning and one `onSpendWarning`; later calls stay quiet while spend stays at or above 70%; after spend is seen under 70% (by a settle or a reservation) the next crossing warns again, including within 24 hours; 24 hours after the last warning, or with a new cap value, it warns again; `task run --json` carries `result.spendWarning` on the crossing run.
- A warning recorded by one process is taken once by the outbox with current spend, can be released and taken again, and stays pending (not delivered, not dropped) while spend is back under 80%: 80% at T0, then 72%, then 96% delivers exactly one warning at 96% and records no second warning; without a database the outbox returns the run's own warning.
- `claimCapPing` returns a claim once per cap episode and again after spend is seen under 70% or 24 hours pass; a released claim lets the next claim in the same episode succeed.

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
(AGENT-3), after a 10 minute timeout, or when the lead process exits or dies
of a SIGINT / SIGTERM / SIGHUP it did not start with ignored
(REQ-plugins-154); it SHALL run in its own process group and
stopping it SHALL stop its whole process tree (SIGTERM, then SIGKILL after a
2 s grace or as soon as the worker exits, REQ-plugins-154), so its plugins
and depth-2 workers never outlive the limit. What the worker left in its
group as it exited SHALL still be stopped by an abort or timeout during the
pipe drain, or by the lead exiting. The
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
- Worker timeout and lead abort kill the worker's same-group and `setsid` grandchildren, not just the worker.
- A lead abort after the worker exited, while its background grandchild still holds the pipe, kills that grandchild.

### REQ-agent-118

A council SHALL deliberate in structured phases when a decision needs more
than one voice (AUTONOMOUS-6). `runCouncil` (`src/autonomous/council.ts`)
SHALL run, in order: **propose**, where each of N voices (2..5) answers the
question independently; **critique**, where each voice whose proposal
finished sees every finished proposal (its own marked as its own) and
critiques the others; and **decide**, where one chair run synthesizes a
decision from the finished proposals and critiques. When fewer than 2 voices
finish the propose phase, no critique or decide run SHALL start and the
outcome SHALL be failed. Failed critiques SHALL NOT block the decide phase.
When the chair does not finish, the outcome SHALL be failed with an empty
decision.

Every voice and the chair SHALL run through the delegation core
(`runDelegateChild`, REQ-agent-117) one level deeper than the lead, so each
keeps its argv, worker env stripping, timeout / abort / exit cleanup and
scrubbed summary. Voices SHALL run at the `read` tier by default, never above
`tool` and never above the lead's tier (an unknown tier is refused). They
SHALL run as non-ADMIN role sessions (`CORVIDINHO_ACTING_IS_ADMIN=0`), so
mutating tools are absent and refused (ROLES-CHAT-2/3), and SHALL get an
empty SAFE-1 allowlist, so a must-ask tool is always denied. At most 2 voices
(`MAX_CONCURRENT_DELEGATES`) SHALL run at once. Each phase entry SHALL be
SAFE-6 scrubbed and capped (1500 chars per voice entry, `DELEGATE_SUMMARY_MAX`
for the decision). Later phases SHALL see only capped text, quoted as data
and not as instructions. A finished run SHALL be quoted by the worker's own
result summary (`DelegateChildOutcome.resultText`, capped at
`DELEGATE_SUMMARY_MAX` rather than the 1800-char chat body).
Each run SHALL get a per-voice time cap (5 min) no larger than the time left.
The whole council SHALL have a wall-clock cap (15 min). When the cap is
reached or the lead aborts, running voices SHALL be stopped, no later phase
SHALL start, and the outcome SHALL be cancelled. The outcome SHALL carry the
decision, the transcript (phase, speaker, lens, ok, state, exit code, text),
per-phase tallies, the union of voice filesChanged, summed tokens, elapsed
time and timeout / abort flags. The voice tier, caps and lenses are safety
defaults. Draft AUTONOMOUS-11 (a multi-model council with a confidence
score) is not an acceptance criterion: voices use the lead's provider and the
council returns no confidence score.

Acceptance Criteria
- With 3 voices the runs go propose 1..3, critique 1..3, then decide, never more than 2 at once. Critique prompts contain every finished proposal, the decide prompt contains every finished proposal and critique, and the outcome is done with the chair's text as the decision.
- A failed proposal drops that voice from critique. Fewer than 2 finished proposals ends the council failed with no critique or decide. Failed critiques still reach the chair. A failed chair gives ok=false and an empty decision. A runner that throws is a failed entry.
- Entries and the decision are scrubbed and capped. The per-voice timeout never exceeds the voice cap or the time left. The council time cap and a lead abort stop running voices, skip later phases and give state cancelled.
- The voice tier defaults to read, `code` is clamped to tool, a read lead clamps to read, and an unknown tier is refused.
- The tool loop offers `council` only for an autonomous-enabled project at code tier below the depth cap, and a lead that calls it gets the decision in the tool message.

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

Amend: `ASK_AGENT_SYSTEM_INSTRUCTIONS` SHALL include AUTONOMY-7 guidance —
impossible / joke “free energy / dark matter / zero-point” style asks get a
witty public-safe decline or tiny toy demo; do not open with ask-human / a
long formal MCQ unless the human clearly wants a real utility. Ask-human
tool description SHALL say clarify addresses the requester (owner ping is for
stuck).

Acceptance Criteria
- ASK_AGENT_SYSTEM_INSTRUCTIONS mentions AUTONOMY-7 / joke-impossible guidance.
- Tool description no longer claims owner is always pinged on clarify.

### REQ-agent-244

An abort SHALL stop the run's work, not only its bookkeeping (AGENT-3):

- The default verify runner SHALL run `fledge lanes run verify
  --non-interactive` in its own process group and, when the run's
  AbortSignal fires, SHALL stop the lane's whole process tree (fledge and
  the lane tasks it started, REQ-plugins-154), so no verify step keeps
  running in the background. An already-aborted signal SHALL NOT start the
  lane. The lane SHALL also be stopped when this process exits or dies of a
  SIGINT / SIGTERM / SIGHUP it does not handle. After an abort the runner
  SHALL wait at most a short grace (250 ms) for the lane's output pipes, so
  a lane process that escaped the kill (its own session, already
  reparented) and still holds a pipe SHALL NOT keep the cancelled run from
  returning.
- `runTask` SHALL return the cancelled result (`cancelled=true`,
  `verified=false`, state `failed`) when the signal aborted while the verify
  lane ran, whatever exit the stopped lane reports and however many retries
  remain: no `VerifyResult`, no retry and no `stuck` ask.
- Each OpenAI-compatible chat completions request of `createTaskExecute`
  (tool loop and read tier) SHALL be bounded by a per-request timeout,
  covering both the wait for headers and the body read (default
  `LLM_REQUEST_TIMEOUT_MS`, 10 minutes; `llmTimeoutMs` option). A request
  that times out SHALL end the attempt with the summary `LLM request timed
  out after <ms>ms` instead of waiting forever; a caller abort SHALL still
  end the request at once and SHALL NOT be reported as a timeout. No
  environment variable is added.

Acceptance Criteria
- A provider that sends headers and then trickles body bytes forever makes a read-tier execute return `LLM request timed out after 300ms` within seconds (`llmTimeoutMs: 300`).
- A provider that never answers makes a tool-tier execute return `LLM request timed out after 200ms` after one request.
- A caller abort during a stalled request returns promptly with an `LLM request failed:` summary, not a timeout.
- A verify runner that sees the abort and returns a failed lane with `maxRetries: 0` yields `cancelled=true`, no `ask`, no `VerifyResult` event and one execute attempt.
- An interrupted `task run` stops a fake `fledge` and the lane task it started (REQ-cli-244).
- An interrupted `task run` whose lane left an escaped process (`setsid`, reparented) holding the lane's stdout exits 130 with a cancelled `result` frame within seconds, not when that process ends.

### REQ-agent-242

`runTask` SHALL treat the files changed by a run as the union of every
attempt's `filesChanged`, so once a verify has failed each later attempt is
verified again, even when that attempt changed no files; the run SHALL end
`done` only after a passing verify, else `failed` when retries run out
(AGENT-4 / AGENT-4.a). `createTaskExecute` SHALL set `ExecuteResult.error`
when the provider call fails (request error, non-2xx HTTP status, a reply that
is not JSON or has no assistant message), and `runTask` SHALL end such an
attempt `failed` with `verified=false` and the provider error as the
summary, with or without the verify gate, never `done` (AGENT-4 / AGENT-8).
When a verify already failed earlier in the run, that summary SHALL go on to
say plainly `Verification failed on an earlier attempt and was not re-run:`
followed by the last verify output, so the provider error never hides failing
files (AGENT-4); a provider error before any verify ran adds no such note.

Acceptance Criteria
- A failed verify followed by retries that change no files runs verify on every attempt and ends `failed` (`task run` exits non-zero), never `done`.
- `TaskResult.filesChanged` is the union across attempts.
- Tool-loop and read-tier provider failures (HTTP 401 / 503, network error) set `error: true`; a normal reply leaves it unset.
- An `execute` error on the first attempt, on a retry, or with the verify gate off ends `failed` without running verify on that attempt.
- An `execute` error after a failed verify keeps the provider error first and then the earlier verify output in the summary; one before any verify does not mention verification.

### REQ-agent-232

The run-summary helpers in `src/agent/task-summary.ts`
(`chatBodyFromTaskResult`, `summarizeTaskResult`, `summarizeTaskRunOutput`,
`chatBodyFromTaskRunOutput`) SHALL pass the result summary, the non-frame
stdout and the stderr fallback through the SAFE-6 scrubber (`scrubSecrets`)
before clipping them to their caps (1800 chars for the summary and stdout, 500
for stderr). A clip must never cut a secret into a shape the scrubber no longer
recognises (a vendor token cut below its minimum length, a private key without
its END line). `--json` stdout SHALL still be parsed from the raw text, and
only the extracted summary is scrubbed. `resultFrame` in
`src/agent/events-ndjson.ts` SHALL scrub an over-long `summary` before capping
it at `NDJSON_LIMITS.resultSummary` (4000 chars). A summary within the cap is
carried unchanged, as with `--json`. Every reader of a spawned run through
`collectTaskRunStream` (WATCH thread comments REQ-watch-231, Discord replies
REQ-discord-073, delegate worker summaries) therefore gets text that was
scrubbed before any clip. Text with no secret SHALL come out exactly as before
(SAFE-6; AGENTS.md Secrets).

Acceptance Criteria
- A `ghp_` token straddling char 500 of the stderr fallback, or char 1800 of non-frame stdout or of the result summary, comes out as `[redacted:github-token]` with no `ghp_` prefix.
- A PEM private key that starts before the 1800-char chat body cap or the 4000-char result frame cap and ends after it leaves no header or key body in the chat body, the result frame, or the WATCH comment and spawn log.
- Token-free summaries, stdout and stderr are trimmed and clipped exactly as before; a result frame within the cap carries the same TaskResult object.
- Fixture tests use runtime-built fake secrets and no network.
### REQ-agent-045

`ask-human` SHALL accept an optional `options` array of short labels (2–5).
`askFromToolArguments` / `askFromUnknown` SHALL populate `HumanAsk.options`
when provided or when the question contains a numbered/lettered choice list
(`resolveAskOptions`). `ASK_AGENT_SYSTEM_INSTRUCTIONS` SHALL steer the model
to prefer options for Discord ephemeral buttons and free-text only when
choices cannot be listed.

Acceptance Criteria
- Tool args with options:2+ → HumanAsk.options set.
- Numbered question lines parse into options when structured options absent.
- Single or empty options do not set HumanAsk.options.

### REQ-agent-260

The repository SHALL ship a root `agent.3md` that validates with
`@corvidlabs/agent3md` `validateAgent`, exposes guidance-only skill planes
(no `tool=` bindings that duplicate the SAFE plugin registry), and is covered
by a bun smoke that `route`s and `get`s at least one playbook. The agent loop
SHALL NOT load this file for progressive disclosure until AGENT-13 is HI'd
separately.
Acceptance Criteria
- `validateAgent(readFileSync("agent.3md")).ok` is true in CI/tests.
- Every skill in `Agent.manifest().skills` has `tool: null`.
- `Agent.route` + `Agent.get` resolve a named guidance playbook (e.g. `discord-ask`).
- `package.json` lists `@corvidlabs/agent3md` as a dependency.
### REQ-agent-312
When the LLM tool loop exhausts `maxToolRounds` without a final no-tool reply, execute SHALL soft-land (AGENT-9): `ExecuteResult.summary` SHALL be the last assistant prose when present, otherwise a short clarifying ask (e.g. "I'm not sure I have enough to answer that cleanly — can you clarify what you meant?"). The summary SHALL NOT contain the operator phrase `Stopped after N tool rounds`. An operator note with that phrase MAY be emitted as a `Text` event for thinking/NDJSON. `chatBodyFromTaskResult` SHALL strip any leftover `Stopped after N tool rounds` lines before Discord outbound (defense in depth).
The tool-loop system prompt SHALL include Discord chat discipline (IDENTITY-5 / DISCORD-13 / ROLES-CHAT-9): prefer conversational prose for social/game banter; call `discord-user-lookup` for snowflakes/@mentions/named members before repo tools; only use SpecSync/git/github/files when the query clearly needs Corvidinho codebase or product data; treat bare `bug <snowflake>` in Discord as a user id, not a GitHub issue.
- Exhausted rounds with no prose → clarify ask; no `Stopped after` in summary.
- Exhausted rounds with prior prose → that prose is the summary.
- Operator `Text` event may carry the stop note.
- `chatBodyFromTaskResult` drops stop lines.
- Fixture: `tests/agent.soft-land.test.ts`.

### REQ-agent-079

`loadLlmEnv(env, tier?)` SHALL resolve the model for the run's effective capability tier (the explicit tier — `--tier` / `createTaskExecute` `tier` — else `CORVIDINHO_LLM_TIER`, default `tool`): the optional key for that tier (`CORVIDINHO_LLM_MODEL_READ`, `CORVIDINHO_LLM_MODEL_TOOL` or `CORVIDINHO_LLM_MODEL_CODE`; blank counts as unset) SHALL win, else `CORVIDINHO_LLM_MODEL`, else `gpt-4o-mini` (AGENT-5). Every chat request of the run SHALL carry that model in `body.model`, so SAFE-8 spend pricing prices the tier's model. The endpoint (`CORVIDINHO_LLM_BASE_URL`) and the API key SHALL stay shared by all tiers. Delegate workers and council voices SHALL inherit the per-tier keys (they are not worker-env-dropped) and SHALL resolve the model at their own tier. With no per-tier key set, every tier SHALL call `CORVIDINHO_LLM_MODEL` exactly as before. Model resolution SHALL NOT print or log the API key. Under a SAFE-8 cap the unpriced-model ask SHALL name the env key that set the run's model (the tier's key when set, else `CORVIDINHO_LLM_MODEL`), and when any per-tier key is set the doctor `spend` line (REQ-cli-098) and the Discord `/status` spend line SHALL warn when any tier's model has no known price and SHALL name that tier; with no per-tier key they SHALL read as before.

Acceptance Criteria
- `CORVIDINHO_LLM_MODEL=big`, `CORVIDINHO_LLM_MODEL_READ=cheap`: a read run sends `cheap`, tool and code runs send `big`; adding `CORVIDINHO_LLM_MODEL_CODE=big2` / `CORVIDINHO_LLM_MODEL_TOOL=mid` makes code send `big2` and tool `mid`.
- `CORVIDINHO_LLM_TIER=code` with `tier: "read"` sends `cheap`; `CORVIDINHO_LLM_TIER=read` with `tier: "code"` sends the code model.
- A read-tier `buildDelegateSpawn` env keeps the per-tier keys and resolves `cheap` (env tier or `--tier read`).
- Under a SAFE-8 cap, an unpriced read model stops a read run before any provider call and the spend-cap ask names that model and `CORVIDINHO_LLM_MODEL_READ` as the key to switch; a tool run on an unpriced shared model names `CORVIDINHO_LLM_MODEL`.
- Under a cap with a priced configured model and `CORVIDINHO_LLM_MODEL_READ` unpriced, doctor prints `[warn] spend: … model "<m>" has no known price, so read-tier runs stop and ask before calling the provider` and `/status` flags the read-tier model; with every tier priced or no per-tier key the lines read as before.
- No per-tier keys → every tier sends `CORVIDINHO_LLM_MODEL`; a blank per-tier key falls back; no model at all → `gpt-4o-mini`.
- Fixture tests mock fetch; no live API.
### REQ-agent-085

Real-diff verify gate (AGENT-4, issue #85). When the verify gate is on,
`runTask` SHALL snapshot the run's git project before the first attempt:
`HEAD`, `git status --porcelain=v1 -z --untracked-files=all --no-renames`
and a fingerprint of every dirty or untracked path (SHA-256 of the file up
to 4 MiB while a 64 MiB content budget lasts, stat identity past either, link
target for a symlink, never followed). Later diffs SHALL fingerprint again
only the paths dirty at the start (with the same kind); a path that became
dirty or untracked is a change by itself. The
project root is the nearest directory at or above the run cwd that holds
`.git` (as in REQ-agent-084); a cwd below the root SHALL read only its own
subtree and report paths relative to the cwd. After each attempt that ends
without an ask, a provider error or an abort, and before deciding whether to
verify, `runTask` SHALL add to `filesChanged` every path that differs from the
snapshot: paths changed between the start `HEAD` and the current `HEAD`
(including a first commit on an unborn `HEAD`), paths that became dirty or
untracked, paths already dirty whose status or fingerprint changed, and
dirty paths that became clean. These join the tool-reported files and the
union across attempts (REQ-agent-242), so an edit no tool reported
(code-tier `shell-exec`, a delegate worker, a commit made through a shell)
runs the verify lane and the run ends `done` only when it passes, or fails
plainly. Paths dirty before the run and left untouched, and gitignored paths,
SHALL NOT count. When the cwd is not inside a git work tree, or the start
snapshot cannot be read, the gate SHALL use tool-reported files only (the
behaviour before this requirement). When the start snapshot was read but a
later diff cannot be, the gate SHALL fail closed: verify runs and one `Text`
event says the diff could not be read. When the real diff adds paths no tool
reported, one `Text` event SHALL say how many and name up to five. At most
`WORKSPACE_DIFF_MAX_FILES` (1000) real-diff paths per run SHALL join
`filesChanged` (the note still gives the full count and how many were
listed), so the NDJSON `result` line stays under the parser's line cap and a
bridge still gets the summary; the gate is unaffected because `filesChanged`
is non-empty either way. An empty
real diff with no tool-reported files SHALL still skip verify with
`verifySkipped=true` (REQ-agent-003). `--no-verify` / `verify_before_complete
= false` SHALL take no snapshot. Git SHALL run read-only through `runGit`
(argv, no shell, hooks off, repo-locating env stripped, discovery clamped to
the root, optional locks off) with fsmonitor off, and fingerprints are hashed
in process: nothing is written to the index or object store. No flag,
environment variable, config key or slash command is added. `RunTaskOptions`
gains a `workspaceDiff` test seam (like `verifyRunner`), not a product
surface.

Acceptance Criteria
- In a temp git repo, an attempt that rewrites a tracked file outside the file tools and reports `filesChanged: []` runs verify; a failing lane ends `failed` (`verified=false`, `verifySkipped=false`, `filesChanged` names the file, no `done` state) and a passing lane ends `done` with `verified=true`.
- A new untracked file, a deleted tracked file, a same-size edit to a file already ` M` before the run, a commit made through a shell (clean tree, `HEAD` moved) and a first commit on an unborn `HEAD` each run verify and appear in `filesChanged`.
- A retry after a failed verify that edits only through a shell is verified again and gets the failure output as feedback (AGENT-4.a).
- A run whose cwd is a subdirectory of the repo counts an edit inside the cwd (reported relative to the cwd) and not one outside it.
- Dirt present before the run and left untouched, a change only under a gitignored path, and a non-git cwd each skip verify (`verifySkipped=true`) when no tool reported files.
- A tracker whose diff cannot be read makes verify run and emits the "could not read the git working-tree diff" `Text` event.
- A tracker whose diff lists 30000 paths adds 1000 of them to `filesChanged` after the tool-reported ones, the note counts all 30000, and the NDJSON `result` line read in 64 KiB chunks still parses with the "Verification failed" summary.
- With the content budget spent, an already-dirty file left alone is not reported and an edit to it is (stat compare).
- With the gate off no snapshot is taken.
- End to end: the tool loop runs the real code-tier `shell-exec` with `printf broken > app.ts` in a temp git repo; its payload has no `filesChanged`, yet `runTask` runs verify once and ends `failed` with `filesChanged: ["app.ts"]`.
### REQ-agent-428

When a tool-loop round's tool results carry an image (`PluginHandlerResult.image`,
`files-read` REQ-plugins-427), the tool loop (REQ-agent-008) SHALL, after it
has pushed all of that round's tool messages, add one user message whose
content is a text part `Image(s) opened with files-read: <paths>` followed by
one `image_url` part per image with a `data:<mime>;base64,<bytes>` URL, so the
model sees the pixels (DISCORD-9). The tool message and the `ToolResult` event
detail SHALL keep only the metadata; the base64 SHALL NOT appear in tool text,
events or ndjson. If a chat/completions request that carries image parts gets
HTTP 400, 404, 413, 415 or 422 (a model or gateway that will not take the
images), the loop SHALL remove every image user message, set the message of
each opened image's tool message to `[image <path> could not be shown to this
model]` (metadata kept, no bytes), emit an `[operator]` Text note and retry
that request once, so the retry has no user message after tool messages;
later images in the same run SHALL get that note in their tool message and no
image message. Any other status (auth, rate limit, server error), a failure on
the retry, or a failure on a request with no image parts SHALL stay a provider
error (REQ-agent-242). No new env var, flag or protocol field.

Acceptance Criteria
- Mock HTTP: round 1 `files-read` of a PNG; the round 2 body has the small tool message (no base64) directly followed by the user message `[text, image_url(data:image/png;base64,…)]`; the round 1 body has no image part.
- Two images in one round ride one user message after both tool messages, with two `image_url` parts.
- The `ToolResult` detail and the run's ndjson lines never contain the base64.
- HTTP 400 on the image request: one retry whose tool message carries the text note, with no user message after the tool messages and no base64; the run completes with the model's reply and no error flag.
- A provider that rejects a user message right after tool messages (role order, HTTP 400) still completes on that retry.
- 404 / 413 / 415 / 422 on the image request fall back the same way; 401 / 429 / 500 stay errors with no retry.
- A refusal also removes the image messages of earlier rounds; each opened image's tool message carries the note.
- After that refusal, a later image in the run goes as the note in its tool message with no second retry.
- 400 again on the retry → error flag with `LLM HTTP 400`; 400 with no image sent → error, no retry.
- Fixture: `tests/agent.tool-loop.test.ts`, no live provider.

