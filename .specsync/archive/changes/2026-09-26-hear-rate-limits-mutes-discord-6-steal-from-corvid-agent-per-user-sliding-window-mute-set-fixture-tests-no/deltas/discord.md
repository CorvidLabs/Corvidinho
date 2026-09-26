---
module: discord
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
---

# Delta — discord (DISCORD-6 rate limits + mutes)

## Added

### REQUIREMENT REQ-discord-010

The bridge SHALL apply per-user sliding-window rate limits and an in-memory
mute set so one user cannot melt the box without punishing everyone else
(DISCORD-6). Rate limit and mute checks SHALL run on mention/reply/thread
continue and on slash dispatch after the channel allowlist gate. Optional
`rateLimitByLevel` SHALL override max messages for a numeric permission level
when provided. Mute seed MAY load from env; mute/unmute helpers mutate the
in-memory set (no SQLite in this thin slice). The bridge SHALL NOT introduce
ProcessManager or weaken allowlists. Fixture tests SHALL cover per-user
independence without a live Discord token.

Acceptance Criteria
- Default window 60s / max 10; env override for window/max + muted seed.
- User A rate-limited or muted → refuse A; user B still served.
- `rateLimitByLevel` override applies when permLevel provided.
- Mention/reply/thread continue and slash share the same per-user limits/mutes.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.

## Modified

### SPEC SECTION Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status, slash ops, and per-user rate limits/mutes
(DISCORD-1/2/2.a/3/4/5/6).

### SPEC SECTION Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, RATE_LIMITED,
MUTED, checkRateLimit, muteUser, unmuteUser, isMuted, agent/gateway helpers,
thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies); loadDiscordPlugins registers
discord-post-message.

### SPEC SECTION Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
missing token clean exit; no ProcessManager; secrets out of repo;
discord-post-message dangerous; thinking status edits one progress message
in-place; slash handlers re-check channel allowlist before acting; rate limit
and mute refuse only the offending user.

### SPEC SECTION Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work on allowlisted channel; rate-limited or muted user refused while
peer continues; non-allowlisted slash refused; missing token / empty channels
refuse cleanly; session run posts progress then Done.

### SPEC SECTION Error Cases

Missing token; empty channels; protocol mismatch; not authorized (message or
slash); muted; rate limited; SAFE-1 deny for discord-post; agent failure marks
progress error then reports; unknown slash command refused.

### SPEC SECTION Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

### SPEC SECTION Change Log

DISCORD-6 per-user rate limits + mutes (2026-09-26, corvid-agent, #12).
