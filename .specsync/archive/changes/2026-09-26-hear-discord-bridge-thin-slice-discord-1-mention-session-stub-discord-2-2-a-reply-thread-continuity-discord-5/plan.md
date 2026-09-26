---
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
artifact: plan
---

# Plan

1. `src/discord/*` thin modules (config, protocol, permissions, session-store, message-router, agent-client, gateway, bridge)
2. CLI: `discord bridge`, `--protocol-version`; doctor Discord go-live hints
3. Plugin `discord-post-message` (dangerous) + register
4. Add `discord.js` dependency; `.env.example` without secrets
5. Specs: `specs/discord/` + cli/plugins deltas; registry/config
6. Fixture/unit tests for router + config + permissions + missing token
7. STATUS/README go-live checklist; AGENTS bootstrap note
8. SpecSync check + fledge verify; PR closes #5; merge when CI green
