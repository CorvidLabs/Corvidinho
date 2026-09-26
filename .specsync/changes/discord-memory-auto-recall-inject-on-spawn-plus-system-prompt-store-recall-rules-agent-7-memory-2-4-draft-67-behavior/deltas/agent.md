---
module: agent
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
---

# Delta — agent (MEMORY system prompt)

## Modified

### SPEC SECTION Purpose

Agent execute tool-loop also carries MEMORY instructions (AGENT-7 / MEMORY-2/4)
so Discord/CLI chats trust injected facts and call memory-store/recall
appropriately (REQ-agent-010).

### SPEC SECTION Public API

Export `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` from `src/agent/execute.ts` (and
`src/agent/index.ts`).

### SPEC SECTION Invariants

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

### SPEC SECTION Behavioral Examples

### Scenario: System prompt mentions memory-store

- **Given** tool-loop execute is constructed
- **When** the system message is built
- **Then** it embeds MEMORY_AGENT_SYSTEM_INSTRUCTIONS with argv example for
  memory-store

### SPEC SECTION Change Log

| 2026-09-26 | memory-discord-inject: MEMORY system prompt + tool argv (REQ-agent-010) |

## Added

### REQUIREMENT REQ-agent-010

The tool-loop system prompt SHALL instruct the model to (a) trust the injected
memory block, (b) call `memory-store` when the user states durable
identity/person/project facts, (c) call `memory-recall` before claiming
ignorance about the user/people/projects, (d) never invent memories
(AGENT-7 / MEMORY-2/4; draft #67 behavior).

Acceptance Criteria
- `MEMORY_AGENT_SYSTEM_INSTRUCTIONS` exported and embedded in tool-loop system.
- Fixture asserts trust / store / recall / never-invent phrases + argv example.
