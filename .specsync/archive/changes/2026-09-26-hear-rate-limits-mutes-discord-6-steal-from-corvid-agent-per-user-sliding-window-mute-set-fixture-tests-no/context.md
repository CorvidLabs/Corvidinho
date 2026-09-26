---
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
artifact: context
---

# Context

Issue #12 (DISCORD-6): rate limits and mutes stop one user from melting the
box, without punishing everyone else.

Confirmed HI: `hi/discord.md` DISCORD-6. Ancestor steal (consult only):
CorvidLabs/corvid-agent `server/discord/permissions.ts` (`checkRateLimit`,
`muteUser` / `unmuteUser`, tiered `rateLimitByLevel`), bridge in-memory maps,
tests in `discord-permissions.test.ts` / `discord-public-mode.test.ts`.

Depends on HEAR thin + slash (#5/#11 → #23/#26): gateway, message-router,
slash-dispatch, allowlists. Soft after thin slice. No ProcessManager, no DB
mute table (in-memory + env seed only), no iced UI, no voice.

Thin useful set matching team preference: per-user sliding window (default
10/60s), optional `rateLimitByLevel`, mute set that blocks only that user on
mention/reply/thread continue and slash. Allowlists stay default-deny.

Update STATUS.md Done when this slice merges (#12 → this PR).
