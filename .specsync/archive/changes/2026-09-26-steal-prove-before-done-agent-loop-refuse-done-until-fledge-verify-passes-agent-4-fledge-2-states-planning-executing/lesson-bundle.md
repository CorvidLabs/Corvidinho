# Lesson bundle — steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: STEAL prove-before-done agent loop: refuse done until fledge verify passes (AGENT-4 / FLEDGE-2); states planning/executing/verifying/done; CLI --no-verify; config verify_before_complete
- **Kind**: Feature
- **Specs**: agent, cli
- **Paths**: src/agent, src/cli.ts, fledge.toml, tests, .specsync/registry.toml, specs/, AGENTS.md, STATUS.md
- **Acceptance**: Task that fails verify is not reported done (verified=false); with retries, failure stdout/stderr is fed back and another execute attempt runs; exhausted retries → clear failure; --no-verify skips gate (verify_skipped); shell fledge lanes run verify and agent gate agree; AGENT-8 states planning/executing/verifying/done|failed emitted; cancellation aborts promptly; bun test + fledge verify green

## Evidence

- Verification commit: `403682477f9a87150840aa38c2499001e2d51207`
- Base commit: `33a6c7f74ef2c2521c5c6ea2de8e552551552e0c`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

Issue #7 STEAL: Merlin prove-before-done / verify-before-complete (AGENT-4 / FLEDGE-2 / AGENT-8).
Main tip already has plugin host (#6/#4 via PR #15). This slice adds the agent task-completion gate only.

Constraints: Linux Bun/TS; no Trust/attest; no ACCESS/bounty/MainNet; WATCH/chat hot path stays `--no-verify` (latency); real code-task completion must pass `fledge lanes run verify --non-interactive`. SpecSync gated in CI separately — not inventing Fledge-in-Actions.

Provenance: Merlin `docs/book/src/architecture/agent-loop.md`, `agent.rs` Verifying, `[merlin] verify_before_complete` / `max_retries`.

## From the change's design.md

# Design

- Lean Merlin steal: Idle→Planning→Executing→Verifying→Done|Failed. No LLM yet; `execute` is an injectable step (tests + CLI demo).
- `verify_before_complete` + `max_retries` from `fledge.toml` `[corvidinho]` (Merlin field names; Corvidinho section). CLI `--no-verify` / `--max-retries` override.
- Default verify runner: `fledge lanes run verify --non-interactive` in project cwd. Injectable for unit tests.
- Verify only when flag on AND execute reports `filesChanged.length > 0` (Merlin want_verify). Empty changes → verify_skipped.
- Events: StateChanged, Text, VerifyResult. Cancellation: AbortSignal checked at state transitions and around verify spawn.
- No Trust/attest. No rollback-on-exhausted in this slice.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (agent loop unit + CLI smoke)
- `bunx tsc --noEmit`
- `bun src/cli.ts task run --no-verify --json`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

- **ci** Bun install/test/typecheck (no Fledge)
- **Spec Sync** CorvidLabs/spec-sync@v6 + change audit

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-001 | `tests/agent.loop.test.ts` state sequence |
| REQ-agent-002 | `tests/agent.loop.test.ts` fail→retry→pass / exhausted |
| REQ-agent-003 | `tests/agent.loop.test.ts` --no-verify skip + abort |
| REQ-cli-005 | `tests/agent.cli.test.ts` task run smoke |

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
