---
change: discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved
artifact: testing
---

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
