# Lesson bundle — discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: DISCORD-6 rate limits and mutes: DISCORD_RATE_LIMIT_BY_LEVEL applies to chat and slash via the actor's resolved permission level, /mute refuses the invoker and the configured owner, and a muted or rate-limited user gets at most one public MessageCreate notice per rate-limit window
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/permissions.ts, src/discord/message-router.ts, src/discord/slash-dispatch.ts, src/discord/command-handlers/mute.ts, docs/discord.md, tests/discord.rate-mute-limits.test.ts
- **Acceptance**: With DISCORD_RATE_LIMIT_MAX=3 and DISCORD_RATE_LIMIT_BY_LEVEL={"3":100} the owner's 4th and later /status and @mentions within the window are served while a STANDARD member is still refused at 4, and a level override applies on chat and slash from the actor's resolved permission level (user, roles, owner); /mute of the invoker or of the configured owner is refused with an ephemeral message and leaves the mute set unchanged, so the owner can never lock themselves out until restart; a muted or rate-limited user's @mention/reply/thread messages get at most one public notice per user per rate-limit window (later refusals in the window are silent, the next window may notify once again), other users are unaffected, and slash refusals stay ephemeral on every call; tests/discord.rate-mute-limits.test.ts covers each and fails on the previous code

## Evidence

- Verification commit: `043e7e5c49658a8a9f90cb24786a5d61afbe7a7f`
- Base commit: `3cdbb5c7cc469fe3d9fbaae991f58d69326da9dd`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

The Discord bridge end-to-end audit on origin/main 543d580 (v0.0.25) found
three DISCORD-6 defects. I re-checked each on 3cdbb5c (current main) with a
throwaway `startBridge` fixture (fake gateway, echo agent, in-memory DB).
All three still reproduced:

- **Defect 6: `DISCORD_RATE_LIMIT_BY_LEVEL` had no effect.** With
  `DISCORD_RATE_LIMIT_MAX=3` and `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}`,
  the owner's 4th `/status` got "Slow down!". The bridge called
  `routeMessage` with `rateLimit: { state, config }` and no `permLevel`,
  and never set `SlashContext.permLevelFor`, so `checkRateLimit` always used
  the default max.
- **Defect 8: the owner could mute themselves.** Owner `/mute user:<owner>`
  replied "Muted …". The next `/unmute user:<owner>` was refused with
  "You do not have permission…", because the mute gate runs before the
  handler and a muted owner is not ADMIN (REQ-discord-012). Mutes live in
  memory, so only a restart recovered.
  `command-handlers/mute.ts` had no check for the invoker or the owner.
- **Defect 11: muted and rate-limited users got a public reply on every
  message.** Five @mentions from a muted user produced five public "You do
  not have permission…" posts. A spammer made the bot post once per spam
  message, which works against DISCORD-6.

HI: DISCORD-6 (rate limits and mutes stop one user from melting the box
without punishing everyone else), IDENTITY-2 (only the configured owner may
use admin slash), and DISCORD-DENY-2 (MessageCreate has no ephemeral; slash
denials are ephemeral). REQ-discord-010 is the owning requirement.

Constraints: no new env var, slash command, table or column; no package bump.
Channel-deny and actor-deny paths are unchanged (still silent on
MessageCreate). Slash refusals keep their ephemeral reply on every call,
because Discord requires an ack within 3 s.

Out of scope, and left to their own changes: the other audit defects (1–5, 7,
9, 10) and the doc drift in the slash gate-order line.

## From the change's design.md

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

## From the change's testing.md

# Testing

All tests here are fixture tests. They use `startBridge` with a fake gateway
that captures `reply`, the echo agent, dry-run in-memory SQLite, a missing
allowlist file and a fake owner snowflake. Some tests call `routeMessage`,
`handleSlashInteraction` and `handleMuteCommand` directly. There is no
Discord, no network and no token.

`tests/discord.rate-mute-limits.test.ts` has 11 tests.

**Defect 6: rate limit by level**
- **Bridge slash.** With `MAX=3` and `BY_LEVEL={"3":100}`, six owner
  `/status` calls are all served. A member's 4th `/status` gets an ephemeral
  "Slow down!".
- **Bridge chat.** Five owner @mentions all run (5 progress embeds, no "Slow
  down!"). Of four member @mentions, three run and one gets "Slow down!".
- **Router, role level.** A member who passes only by an allowed role is
  STANDARD. With `{2:1}`, that member's 2nd mention is refused.
- **Slash dispatch, role level and override.** The same role-based limit
  applies in slash dispatch. An explicit `permLevelFor` pinning ADMIN (50)
  still wins.

**Defect 8: self and owner mute**
- **Bridge.** Owner `/mute user:<owner>` gets the ephemeral
  `MUTE_SELF_OR_OWNER_REFUSED`, and the owner is not in the mute set. The
  owner's `/unmute` and `/status` still work. Owner `/mute` of a member mutes
  them (the member's `/status` gets an ephemeral `MUTED`), and `/unmute`
  clears it.
- **Handler.** Any invoker's `/mute` of the configured owner is refused. With
  no owner configured, a self-mute is refused. Both leave the set empty.

**Defect 11: one public notice per window**
- **Bridge, muted.** A muted user sends five @mentions. There is exactly one
  public reply (`MUTED`), no progress embed and no session. A peer still runs.
- **Bridge, rate-limited.** With `MAX=1`, a user sends five @mentions. One
  runs, and there is exactly one public "Slow down!". A peer still runs.
- **Router, window reset.** The first mute refusal carries `reply`. A
  reply-to-bot and a mention later in the window are silent refusals. The
  next refusal after `windowMs` carries `reply` again. A peer starts a
  session.
- **Bridge slash.** A muted user's `/status` gets the ephemeral `MUTED` on
  each of three calls, and nothing is public.
- **`claimRefusalNotice` unit.** The budget is per user and per window, and
  expired entries are dropped.

**Before and after the fix.** I stashed the four `src/` changes and ran a
copy of this test file on the old sources. The copy used a string literal in
place of the new `MUTE_SELF_OR_OWNER_REFUSED` export and skipped the
`claimRefusalNotice` unit, which is a new helper. Results:

- 9 tests fail: 4 for defect 6, 2 for defect 8, 3 for defect 11.
- The slash-stays-ephemeral guard passes on both old and new code.
- With the fix, all 11 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-010` (rate limit by level) | `tests/discord.rate-mute-limits.test.ts` | "bridge slash: owner (ADMIN=3) gets the level-3 max…", "bridge chat: owner mentions past the default max still run…", "router: a member holding an allowed role…", "slash dispatch: role-resolved level applies; an explicit permLevelFor still wins". On old code the owner's 4th `/status` and 4th mention got "Slow down!", and role-based limits used the default max. All four fail before the fix and pass after. |
| `REQ-discord-010` / IDENTITY-2 (no self/owner mute) | `tests/discord.rate-mute-limits.test.ts` | "bridge: owner /mute of themselves is refused ephemeral…" and "handler: the configured owner cannot be muted by any invoker…". On old code the owner was muted and `/unmute` got `MUTED`. Both fail before and pass after. |
| `REQ-discord-010` / DISCORD-DENY-2 (one public notice per window; slash ephemeral) | `tests/discord.rate-mute-limits.test.ts` | "bridge: a muted spammer gets one public reply…", "bridge: a rate-limited spammer gets one 'Slow down!' per window…", "router: the notice comes back once the window has passed…". On old code there were 5 and 4 public replies, and every refusal carried `reply`. These fail before and pass after. "slash refusals stay ephemeral on every call" passes on both. "claimRefusalNotice: …" covers the new helper. |
| `REQ-discord-010` (existing bullets) | `tests/discord.rate-mute.test.ts` | Per-user independence, default and env knobs, mute and rate on mention, reply and slash all still pass unchanged. |
| `REQ-discord-011` / `REQ-discord-012` / `REQ-discord-201` | `tests/discord.admin-reauth.test.ts`, `tests/discord.owner.test.ts`, `tests/discord.actor-gate.test.ts`, `tests/discord.slash.test.ts` | The non-admin `/mute` refusal, a muted owner not being ADMIN, and the actor and channel gate order all still pass. |

Full suite: `bun test` green, `bunx tsc --noEmit` clean,
`specsync check --require-coverage 100` and
`fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/discord/context.md`
