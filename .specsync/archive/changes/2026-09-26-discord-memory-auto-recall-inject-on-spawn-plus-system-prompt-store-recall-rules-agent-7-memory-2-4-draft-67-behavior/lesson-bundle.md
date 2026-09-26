# Lesson bundle — discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7
- **Kind**: Feature
- **Specs**: discord, agent, plugins, cli
- **Paths**: src/discord/memory-inject.ts, src/discord/bridge.ts, src/agent/execute.ts, src/agent/tools.ts, plugins/memory/commands.ts, tests/discord.memory-inject.test.ts, package.json, CHANGELOG.md, STATUS.md
- **Acceptance**: Discord spawn prepends recalled memories (limit ~20) for msg.authorId before runChat; empty scope still gets empty one-liner; bridge logs inject count; system prompt instructs trust inject / memory-store on durable facts / memory-recall before claiming ignorance / never invent; memory-* tool descriptions include argv examples; fixture tests green; package 0.0.7; no /memory slash; cites AGENT-7 MEMORY-2/4 (draft #67 behavior)

## Evidence

- Verification commit: `838a8ee72c3ab32ef408dcc5836e6e813da5bcc3`
- Base commit: `c3b4d8881ea2d9a5b968eb47b9eda35c6e1b2233`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Leif dogfooded Discord MEMORY (channel 1408845298629083220): said "I am Leif"
(bot greeted but never called memory-store); asked "who am I" (memory-recall
returned empty for his user id at the time; bot claimed ignorance). Store and
plugins work — gap is Discord agent-loop behavior + empty owner scope + opaque
tool schemas. System prompt in `src/agent/execute.ts` never mentioned memory
tools; Discord spawn passed raw prompt only (no auto-inject). Seeded identity
for user `181969874455756800` now exists. HI captured: MEMORY-1..4,
MEMORY-ACL-1..5, AGENT-7. No `/memory` slash. Draft #67 "recall before claiming
ignorance" implemented as agent/prompt behavior under AGENT-7 / MEMORY-2/4
without inventing new HI ids. Version: 0.0.6 claimed by #81 → ship as **0.0.7**.

## From the change's design.md

# Design

Pure inject helper mirrors DISCORD-9 `enrichPromptWithImages`: recall via existing
`MemoryStore.recall({ ownerUserId, limit: 20 })`, prepend block, leave ACL
unchanged. System prompt rules live in execute tool-loop (Discord spawns
`task run --no-verify --task <enriched>`). Tool description enrichment only —
no schema redesign beyond richer argv text for memory-*. No new HI ids; cite
AGENT-7 + MEMORY-2/4 for draft #67 "recall before claiming ignorance".

## From the change's testing.md

# Testing

## Local gates

- `bun test` (incl. `tests/discord.memory-inject.test.ts`)
- `bunx tsc --noEmit` / `fledge lanes run verify --non-interactive`
- `specsync check`

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-023 | `tests/discord.memory-inject.test.ts` format/enrich empty+seeded; bridge uses enrichPromptWithMemories |
| REQ-agent-010 | same test asserts MEMORY_AGENT_SYSTEM_INSTRUCTIONS phrases |
| REQ-plugins-085 | memory command descriptions + buildOpenAiTools argv examples in same test |
| REQ-cli-014 | package.json 0.0.7; `bun src/cli.ts version`; CHANGELOG/STATUS |

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
