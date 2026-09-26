---
module: agent
version: 17
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

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010).

## Public API

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

## Invariants

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

## Behavioral Examples

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

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
| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but: Tool loop dispatches only tools offered in the run's catalog (SAFE-1 / AGENT-5, PR #128 review follow-up): a registered but not-offered (e.g. dangerous or above-tier) plugin name from the model is refused instead of run; memory store test updated for soft-deleted re-store history |
