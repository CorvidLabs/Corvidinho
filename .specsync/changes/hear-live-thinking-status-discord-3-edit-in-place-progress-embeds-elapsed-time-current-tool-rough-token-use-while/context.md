---
change: hear-live-thinking-status-discord-3-edit-in-place-progress-embeds-elapsed-time-current-tool-rough-token-use-while
artifact: context
---

# Context

Issue #10 (DISCORD-3): while the agent thinks, Discord should show a live status
(elapsed time, current tool, rough token use) instead of a silent void.

Confirmed HI: `hi/discord.md` DISCORD-3. Ancestor: CorvidLabs/corvid-agent
`progress-response.ts` / `embeds.ts` (edit-in-place progress embed).

Depends on HEAR thin (#5 → PR #23): gateway → message-router → session stub.
Thin HEAR has no ProcessManager; chat spawn is opaque `runChat`. Steal the UX
shape (one progress message edited in-channel), not ProcessManager subscriptions.

Out of scope: iced UI, Telegram, token-gating product UI, slash commands (#11+),
weakening allowlists.

Also refresh STATUS.md Done table: HEAR thin #5→#23 and attribution #20→#24
already on main tip.
