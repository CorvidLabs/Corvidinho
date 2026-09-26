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

`task run` SHALL use a thin provider-agnostic execute hook: when
`CORVIDINHO_LLM_API_KEY` (or documented fallback such as `OPENAI_API_KEY`) is
set, call an OpenAI-compatible chat completions endpoint
(`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`); otherwise keep the demo
execute stub that reports a synthetic file change for the verify-gate exercise.
This SHALL NOT invent a full LLM tool loop (follow-up issue). Secrets SHALL stay
in env; never commit real keys.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat call; summary from assistant text; filesChanged empty (no tool loop).
- Fixture tests cover no-key path; key path may mock fetch (no live API in CI).
