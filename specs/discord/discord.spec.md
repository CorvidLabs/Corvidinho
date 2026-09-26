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

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
DISCORD-9 image attachments + DISCORD-10 protocol lockstep (2026-09-26, corvid-agent image-attachments + Merlin protocol-version, #14).
| 2026-09-26 | hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version: HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14 |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: bun-invoke .ts for protocol+spawn; parse task run --json for Discord summary |
| 2026-09-26 | bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral: Bump Corvidinho to 0.0.2; shared version helper from package.json for CLI and Discord bridge /status; enrich ephemeral /status with uptime protocol channels sessions work LLM model+host (no key) slash command names optional git tip SHA; STATUS dogfood polish note; no new slash commands |
| 2026-09-26 | clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global: guild PUT of six + clear globals (REQ-discord-016); discord register-commands CLI |
| 2026-09-26 | discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src: Discord presence/custom status shows shared package version on ClientReady (DISCORD-12); fixture test; no slash/allowlist churn |

| 2026-09-26 | discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin: DISCORD-DENY-1..3 silent MessageCreate + slash admin tip / non-admin zero-width; docs/discord.md |
| 2026-09-26 | session-durable-store: Discord SessionStore/WorkStore SQLite durability + soft TTL (SESSION-1..4 / REQ-discord-019); shared store module; no MEMORY ACL /schedule |
| 2026-09-26 | session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho: SESSION durable store: Discord SessionStore (+ WorkStore) survive restarts via local SQLite under ~/.local/share/corvidinho/ (align MEMORY #41 path); soft TTL 30-60m keep-alive on activity; idle/stale → fresh session (SESSION-1..4); no ProcessManager; no /schedule; no MEMORY ACL |
| 2026-09-26 | discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume: Discord /schedule slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / issue #57): list create pause resume delete; admin mutations; 5m min interval; steal corvid-agent schedule-commands + scheduler; ticks must not starve HEAR/WATCH ingress; no flock/council/templates/on-chain |
| 2026-09-26 | memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user: MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4 |
| 2026-09-26 | session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks: SESSION-WORKTREE per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / issue #58) + package v0.0.5 |
| 2026-09-26 | memory-discord-inject: auto-recall prepend on spawn (REQ-discord-023 / AGENT-7 / MEMORY-2/4); package 0.0.7 |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
