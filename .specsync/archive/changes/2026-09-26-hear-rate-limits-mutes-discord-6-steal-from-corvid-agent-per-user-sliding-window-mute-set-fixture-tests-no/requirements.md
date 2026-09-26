---
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
artifact: requirements
---

# Requirements

## DISCORD-6 rate limits + mutes (thin)

- Bridge SHALL apply a per-user sliding-window rate limit on mention/reply/
  thread continue and slash dispatch so one user cannot melt the box
  (DISCORD-6). Default window 60s / max 10 messages (ancestor defaults);
  overridable via env.
- Optional `rateLimitByLevel` SHALL override max messages for a numeric
  permission level when provided (ancestor pattern); when omitted, default
  max applies.
- Bridge SHALL maintain an in-memory muted-user set. Muted users SHALL be
  refused on hear paths and slash; other users SHALL remain unaffected.
- Mute seed MAY load from env (`DISCORD_MUTED_USER_IDS`); mute/unmute helpers
  SHALL mutate the in-memory set without a DB migration in this thin slice.
- Rate-limited and muted refuses SHALL be per-user only — limiting or muting
  user A MUST NOT refuse user B.
- SHALL NOT weaken allowlists, introduce ProcessManager, persist mutes to
  SQLite, or require a live Discord token for tests. Secrets stay out of the
  repo.
