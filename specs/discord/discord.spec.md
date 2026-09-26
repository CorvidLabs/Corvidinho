---
module: discord
version: 8
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/discord/message-router.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
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
thinking status (DISCORD-1/2/2.a/3/5).

## Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, goLiveChecklist,
CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway helpers,
thinking-status builders/controller (formatElapsed, buildThinkingEmbed,
ThinkingStatus); loadDiscordPlugins registers discord-post-message.

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
missing token clean exit; no ProcessManager; secrets out of repo;
discord-post-message dangerous; thinking status edits one progress message
in-place (no spam of new status messages each tick).

## Behavioral Examples

Mention→start_session; reply/thread→continue_session; missing token / empty
channels refuse cleanly; session run posts progress then edits elapsed/tool/
tokens then Done + final reply.

## Error Cases

Missing token; empty channels; protocol mismatch; not authorized;
SAFE-1 deny for discord-post; agent failure marks progress error then reports.

## Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

## Change Log

DISCORD-3 live thinking status (2026-09-26, corvid-agent, #10).

