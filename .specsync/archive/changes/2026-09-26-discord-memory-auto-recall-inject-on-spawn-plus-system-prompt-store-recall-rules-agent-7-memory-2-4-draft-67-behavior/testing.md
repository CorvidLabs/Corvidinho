---
change: discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior
artifact: testing
---

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
