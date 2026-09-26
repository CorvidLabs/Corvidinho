---
module: discord
version: 3
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

Thin Discord HEAR bridge: gateway → message-router → session stub (DISCORD-1/2/2.a/5).

## Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, agent/gateway helpers; loadDiscordPlugins registers discord-post-message.

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked; missing token clean exit; no ProcessManager; secrets out of repo; discord-post-message dangerous.

## Behavioral Examples

Mention→start_session; reply/thread→continue_session; missing token / empty channels refuse cleanly.

## Error Cases

Missing token; empty channels; protocol mismatch; not authorized; SAFE-1 deny for discord-post.

## Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

## Change Log

HEAR thin DISCORD-1/2/2.a/5 (2026-09-26, corvid-agent, #5).
| 2026-09-26 | hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5: HEAR Discord bridge thin slice: DISCORD-1 mention→session stub, DISCORD-2/2.a reply/thread continuity, DISCORD-5 allowlisted channels only; gateway→message-router→session stub; no ProcessManager; token clean-exit; discord-post dangerous; spawn --no-verify |
