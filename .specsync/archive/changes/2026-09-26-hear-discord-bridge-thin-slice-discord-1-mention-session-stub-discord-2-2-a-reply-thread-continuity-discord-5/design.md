---
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
artifact: design
---

# Design

Lean path only: **gateway → message-router → session stub**.

```
src/discord/
  types.ts          inbound message + session stub types
  config.ts         token + allowlist load; fail if channels empty
  protocol.ts       CORVIDINHO_PROTOCOL_VERSION + handshake
  permissions.ts    isMonitoredChannel via allowlist checkChannel
  session-store.ts  in-memory mentionMsgId→session, threadId→session
  message-router.ts mention / reply / thread routing
  agent-client.ts   spawn corvidinho task run --no-verify (injectable)
  gateway.ts        discord.js Client when live; injectable for tests
  bridge.ts         startBridge orchestrator + clean missing-token exit
  index.ts          public exports
```

- No ProcessManager, no voice, no slash (soft later), no Angular/AlgoChat/iced.
- Channel gate first; user/role optional when provided (empty lists deny).
- `discord-post-message` dangerous plugin: allowlist channel check + refuse without token (stub post path OK).
- Tests inject fake inbound messages; no live Discord required.
