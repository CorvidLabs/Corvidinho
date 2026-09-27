---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: design
---

# Design

**Rate limit by level (defect 6).** Both call sites resolve the actor's level
when no explicit level is given:

- `routeMessage` (`refuseRateOrMute`) calls
  `resolvePermissionLevel({ userId, roleIds: msg.authorRoleIds, allowlist,
  owner })`.
- `handleSlashInteraction` does the same with `interaction.roleIds` when
  `ctx.permLevelFor` is unset or returns `undefined`.

The level comes from the same resolver the ADMIN floor uses, so the owner is
3 and an allowed user or role is 2. Resolving inside the router and the
dispatcher, rather than in a bridge-side `permLevelFor(userId)`, keeps role
ids in play: a member who passes only by role would resolve BLOCKED without
them. So `bridge.ts` needs no change. Mutes are not passed to the resolver,
because `gateRateOrMute` checks mute first. The explicit override fields stay
for callers and tests.

**No self/owner mute (defect 8).** `handleMuteCommand` refuses when the
target equals `interaction.userId` or `isOwnerDiscord(ctx.owner, target)`.
It replies `MUTE_SELF_OR_OWNER_REFUSED` (ephemeral) and does not touch the
set. `/unmute` is unchanged. An operator who seeds the owner through
`DISCORD_MUTED_USER_IDS` keeps the REQ-discord-012 behaviour, since that is
deliberate config.

**One public notice per window (defect 11).** `RateLimitState` gains an
optional `refusalNoticeAt` map (user id → last notice ms), created on first
use. `claimRefusalNotice(state, userId, windowMs, nowMs)` returns true and
records the time when the user has had no notice in the last `windowMs`.
Each claim drops expired entries, so the map holds only users noticed in the
current window.

`refuseRateOrMute` still returns `{ kind: "refuse", reason }` for every
refusal. It includes `reply` only when the claim succeeds. The bridge already
posts only when `action.reply` is set, so a refusal without `reply` posts
nothing.

The budget is per user, not per reason, which matches "at most once per
window per user". It uses the configured rate-limit window. Without a
rate-limit state (router unit callers that pass only `mutedUsers`), the
reply is kept as before. Slash dispatch does not use the claim.
