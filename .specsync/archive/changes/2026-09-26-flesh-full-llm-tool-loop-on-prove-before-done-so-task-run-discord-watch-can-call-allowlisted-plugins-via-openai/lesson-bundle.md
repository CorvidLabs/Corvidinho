# Lesson bundle — flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP)
- **Kind**: Feature
- **Specs**: agent, cli
- **Paths**: src/agent/execute.ts, src/agent/tier.ts, src/agent/tools.ts, src/agent/types.ts, src/agent/index.ts, src/cli.ts, tests/agent.tool-loop.test.ts, .env.example, STATUS.md
- **Acceptance**: When CORVIDINHO_LLM_API_KEY (or OPENAI_API_KEY) is set and tier is tool|code, task run runs an interruptible OpenAI-compatible tool loop over allowlisted plugins; read tier stays chat-only; no key keeps demo stub; AbortSignal stops promptly; SAFE-1 dangerous deny unchanged; prove-before-done still gates when filesChanged reported; fixture tests mock HTTP (no live key); Discord/WATCH keep --no-verify; STATUS DOGFOOD updated; SpecSync + fledge verify green; no #9; no invented ACCESS/bounty/MainNet HI

## Evidence

- Verification commit: `d51da32bf47a4ac1363a3708a3289d50aa0b1f49`
- Base commit: `4ef180b31cf719ac1e1661d209b37360781dd026`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

STATUS DOGFOOD gap and issue #31: Discord HEAR is live on Leif's box, prove-before-done (#17)
and thin env-gated chat execute (#32) landed, but `task run` still could not call plugins via
an LLM — only a single chat-completions summary stub.

Steal Merlin agent-loop Executing↔ToolUse pattern thinly: OpenAI-compatible tools mapped from
the in-process plugin registry, interruptible rounds, capability tier (AGENT-5), SAFE-1 deny
unchanged. Do not invent ACCESS/bounty/MainNet HI; do not touch #9; Discord/WATCH keep
`--no-verify` for latency.

## From the change's design.md

# Design

- `src/agent/tier.ts` — read|tool|code (AGENT-5); filter plugin minTier.
- `src/agent/tools.ts` — plugins → OpenAI tool defs; argv parse; filesChanged harvest.
- Upgrade `src/agent/execute.ts` — when key + tier≠read: chat↔tool loop via `runPlugin`
  (SAFE-1 non-interactive default); emit ToolCall/ToolResult; AbortSignal between rounds.
- Extend `AgentEvent` with ToolCall/ToolResult.
- CLI `--tier` + `CORVIDINHO_LLM_TIER`; wire allowlist/cwd/onEvent into createTaskExecute.
- Fixture tests mock fetch (no live API key).
- Honest MVP gaps noted on STATUS/issue: no AGENT-6/7, no streaming, no mid-run escalation.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
|-------------|----------|
| REQ-agent-007 | `tests/agent.execute.test.ts`, `tests/agent.tool-loop.test.ts` demo + key paths |
| REQ-agent-008 | `tests/agent.tool-loop.test.ts` tool loop mock HTTP + abort + SAFE-1 |
| REQ-agent-009 | `tests/agent.tool-loop.test.ts` tier parse/filter + read-tier no tools |
| REQ-cli-007 | `src/cli.ts` task run + `tests/agent.execute.test.ts` / help documents LLM path |
| REQ-cli-009 | CLI help documents `--tier`; task run wires createTaskExecute with tier |

## Commands

```
bun test tests/agent.tool-loop.test.ts tests/agent.execute.test.ts
bunx tsc --noEmit
specsync check --spec agent --spec cli
fledge lanes run verify --non-interactive
```

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
