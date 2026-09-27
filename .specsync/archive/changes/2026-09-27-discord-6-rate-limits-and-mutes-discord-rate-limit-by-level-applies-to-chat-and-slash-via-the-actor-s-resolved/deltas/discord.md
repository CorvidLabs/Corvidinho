---
module: discord
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
---

# Delta — discord (DISCORD-6: rate limit by level, no self/owner mute, one public refusal notice per window)

## Modified

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

The permission level that `rateLimitByLevel` (`DISCORD_RATE_LIMIT_BY_LEVEL`)
keys on SHALL be the actor's level from `resolvePermissionLevel` (user id,
role ids, allowlist, configured owner; mutes are checked before the rate
limit) on both the chat path (`routeMessage`) and slash dispatch, unless a
caller passes an explicit level (`RouterDeps.rateLimit.permLevel` /
`SlashContext.permLevelFor`). `/mute` SHALL refuse a target that is the
invoker or the configured owner (IDENTITY-2) with an ephemeral message and
SHALL leave the mute set unchanged, so the owner can never mute themselves
out of ADMIN and `/unmute` until restart. MessageCreate has no ephemeral:
a muted or rate-limited user's @mention/reply/thread message SHALL get at
most one public notice (`MUTED` / `RATE_LIMITED`) per user per rate-limit
window (`claimRefusalNotice`); later refusals in that window SHALL be
silent, still with no session and no agent run. Slash refusals SHALL stay
ephemeral on every call (DISCORD-DENY / Discord's 3 s ack). No new env var,
slash command, table or column.

Acceptance Criteria
- Default window 60s / max 10; env override for window/max + muted seed.
- User A rate-limited or muted → refuse A; user B still served.
- `rateLimitByLevel` override applies when permLevel provided.
- Mention/reply/thread continue and slash share the same per-user limits/mutes.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.
- With `DISCORD_RATE_LIMIT_MAX=3` and `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}`, the owner's 4th and later `/status` and @mentions in the window are served; a member's 4th `/status` gets an ephemeral "Slow down!" and a member's 4th @mention is refused.
- A member who passes only by an allowed role is limited at the STANDARD (2) level max on chat and slash; an explicit `permLevelFor` still overrides.
- Owner `/mute user:<owner>` gets an ephemeral refusal and the owner is not muted; `/unmute` and `/status` still work for the owner. Any invoker's `/mute` of the configured owner, and a self-mute with no owner configured, are refused the same way. `/mute` of another user still mutes them.
- A muted user who sends 5 @mentions gets exactly one public reply and no session or agent run; a rate-limited user (max 1) who sends 5 gets one public "Slow down!"; a peer is still served.
- After a notice, a muted user's reply-to-bot in the same window is refused silently; once the window has passed since that notice, the next refusal notifies once again.
- A muted user's `/status` gets the ephemeral `MUTED` reply on every call and nothing is posted publicly.
