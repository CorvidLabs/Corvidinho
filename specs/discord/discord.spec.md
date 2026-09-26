---
module: discord
version: 45
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/memory-inject.ts
  - tests/discord.memory-inject.test.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/store/db.ts
  - src/store/index.ts
  - src/store/paths.ts
  - src/store/session-ttl.ts
  - src/worktree/index.ts
  - src/worktree/manager.ts
  - src/worktree/cleanup.ts
  - tests/worktree.test.ts
  - tests/discord.session-worktree.test.ts
  - src/memory/types.ts
  - src/memory/store.ts
  - src/memory/index.ts
  - tests/memory.store.test.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/presence.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
  - src/discord/slash-commands.ts
  - src/discord/register-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - src/discord/command-handlers/status.ts
  - src/discord/command-handlers/agents.ts
  - src/discord/command-handlers/work.ts
  - src/discord/command-handlers/mute.ts
  - src/discord/command-handlers/schedule.ts
  - src/scheduler/cron.ts
  - src/scheduler/store.ts
  - src/scheduler/service.ts
  - src/scheduler/index.ts
  - tests/discord.schedule.test.ts
  - tests/scheduler.cron.test.ts
  - tests/scheduler.service.test.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts
  - tests/discord.protocol-version.test.ts
  - tests/discord.presence.test.ts

db_tables: []
depends_on:
  - plugins
  - agent
  - cli
---

# Discord

## Purpose

HEAR Discord bridge also auto-recalls MEMORY for the acting Discord user on
spawn and prepends an inject block to the agent prompt (AGENT-7 / MEMORY-2/4 /
REQ-discord-023), alongside image attachments, schedule, presence, and
session worktrees.

## Public API

Export `enrichPromptWithMemories`, `formatMemoryInjectBlock`, and related
constants/types from `src/discord/memory-inject.ts` (also re-exported via
`src/discord/index.ts`).

## Invariants

When `memoryStore` is available on the bridge, every routed chat spawn SHALL
recall for `msg.authorId` (limit ~20) and prepend the inject block before
`agent.runChat`. Empty recall still prepends the empty one-liner. Missing store
or blank author id leaves the prompt unchanged. Bridge logs inject count.
No `/memory` slash command.

## Behavioral Examples

### Scenario: Spawn with seeded identity

- **Given** a MemoryStore row `person/identity` for Discord user U
- **When** U sends a chat message the bridge routes to the agent
- **Then** the agent prompt starts with the Corvidinho memory header and a
  `- person/identity: …` bullet, and the bridge logs a non-zero inject count

### Scenario: Empty owner scope

- **Given** no memories for user U
- **When** U chats
- **Then** the prompt still includes the empty-memory one-liner nudging
  `memory-store`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| memoryStore undefined | Prompt unchanged; no inject log |
| Blank author id | Prompt unchanged; no inject |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)

## Change Log

Preserve historical Change Log prose/rows; append the memory-discord-inject row.

| 2026-09-26 | memory-discord-inject: auto-recall prepend on spawn (REQ-discord-023 / AGENT-7 / MEMORY-2/4); package 0.0.7 |

