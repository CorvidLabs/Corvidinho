---
module: agent
version: 22
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
  - src/agent/project-instructions.ts
  - src/agent/events-ndjson.ts
  - tests/agent.execute.test.ts
  - tests/agent.tool-loop.test.ts
  - tests/spawn.argv.test.ts
  - tests/agent.project-instructions.test.ts
  - tests/agent.events-ndjson.test.ts
  - tests/agent.ndjson-spawn.test.ts

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

`task-summary` exports `formatTaskPlumbing`, `chatBodyFromTaskResult`, and
`chatBodyFromTaskRunOutput` alongside `summarizeTaskResult`. Discord/NDJSON
bridge summaries SHALL use the chat-body helpers so operator plumbing never
appears in the final chat reply (DISCORD-3.a).

`execute` system prompt SHALL include IDENTITY-4 and ROLES-CHAT-8 instruction
blocks (`IDENTITY_AGENT_SYSTEM_INSTRUCTIONS`, `PUBLIC_QA_AGENT_SYSTEM_INSTRUCTIONS`)
in addition to MEMORY instructions.

## Invariants

Tool-loop system prompt SHALL include trust-inject / memory-store /
memory-recall-before-ignorance / never-invent rules. OpenAI tool argv
descriptions for `memory-*` commands SHALL include concrete examples.

NDJSON frames never carry raw tool arguments; ToolCall `argsSummary`, Text,
ToolResult detail and VerifyResult output are SAFE-6 scrubbed and capped.
AgentEvent stays frozen (usage is a separate callback), so `task run --json`
events are unchanged.

Project instructions come only from the project root (nearest `.git` at or
above cwd, else cwd), never from a parent directory above it. Each file is
capped at 16 KiB with a truncation marker, SAFE-6 scrubbed, and labelled as
project instructions that cannot widen SAFE-1 consent, the tool allowlist or
the capability tier. The loader never throws.

In a git project only the `HEAD` copy of an instruction file reaches the
system prompt. The file tools (files-write / files-edit, not dangerous) can
change the working tree without consent, so working-tree edits and untracked
instruction files are never loaded; only a commit, which needs a dangerous,
consented tool such as `git-commit` (SAFE-1), changes what later runs see. A
`.git` that git cannot read never falls back to the working tree. Committed
symlinks are followed only as paths inside the commit, never through the
filesystem.

`buildOpenAiTools` omits mutating plugins when `actingIsAdmin` is false (ROLES-CHAT-2); `createTaskExecute` resolves ADMIN from env via `resolveActingIsAdmin` when a role session is active.

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
| AGENTS.md / CLAUDE.md missing | skipped; system prompt unchanged |
| Instruction file symlink resolves outside the project | refused; named in a one-time Text note; run continues |
| Instruction file is a directory, binary, or not UTF-8 | refused; named in a one-time Text note; run continues |
| Instruction file over 16 KiB | first 16 KiB kept (UTF-8 boundary) plus truncation marker; one-time Text note |
| Git project: working-tree AGENTS.md / CLAUDE.md differs from HEAD | HEAD copy loaded; one-time Text note says working-tree changes were not loaded |
| Git project: instruction file untracked, or HEAD unborn | refused as not committed; named in the Text note |
| Git project: `.git` unusable (not a repo top level, git missing) | present files refused; no working-tree fallback |
| Git project: committed symlink leaves the commit, is broken, hops a symlinked dir, or loops | refused; named in the Text note |

## Dependencies

Spawns `fledge` for the default verify runner. Reads SpecSync registry/specs via plugin helpers. Dispatches allowlisted plugins via `runPlugin` during the LLM tool loop. No Trust/attest.

## Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: chat/plumbing split for Discord summaries; identity + public Q&A system instructions |

