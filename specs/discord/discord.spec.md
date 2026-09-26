---
module: discord
version: 15
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
  - src/discord/slash-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - src/discord/command-handlers/status.ts
  - src/discord/command-handlers/agents.ts
  - src/discord/command-handlers/work.ts
  - src/discord/index.ts
  - plugins/discord/index.ts

db_tables: []
depends_on:
  - plugins
  - agent
  - cli
---

# Discord

## Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status and slash ops (DISCORD-1/2/2.a/3/4/5).

## Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway
helpers, thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies); loadDiscordPlugins registers
discord-post-message.

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
missing token clean exit; no ProcessManager; secrets out of repo;
discord-post-message dangerous; thinking status edits one progress message
in-place; slash handlers re-check channel allowlist before acting.

## Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work on allowlisted channel; non-allowlisted slash refused; missing
token / empty channels refuse cleanly; session run posts progress then Done.

## Error Cases

Missing token; empty channels; protocol mismatch; not authorized (message or
slash); SAFE-1 deny for discord-post; agent failure marks progress error then
reports; unknown slash command refused.

## Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

## Change Log

DISCORD-4 thin slash session/status/agents/work (2026-09-26, corvid-agent, #11).

