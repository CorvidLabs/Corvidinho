# Lesson bundle — hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: HEAR rate limits + mutes (DISCORD-6) — steal from corvid-agent; per-user sliding window + mute set; fixture tests; no ProcessManager; STATUS Done for #12
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, tests, docs, STATUS.md, .env.example
- **Acceptance**: Per-user sliding-window rate limit and in-memory mute set refuse only that user on mention/reply/slash (DISCORD-6); other users unaffected; rateLimitByLevel override optional; env knobs for window/max + muted seed; fixture tests no live token; allowlists stay default-deny; no ProcessManager; STATUS Done for #12 when merged

## Evidence

- Verification commit: `04d9730e084bcdca738fd64c1df92b312b29613f`
- Base commit: `435556dcaedb9817bef4466404825147c9da817e`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's testing.md

# Testing

- Unit: checkRateLimit allows under max, refuses at max, prunes old window,
  rateLimitByLevel override, per-user independence.
- Unit: muteUser/unmuteUser/isMuted; muted user refused on router + slash;
  unmuted peer still served.
- Router: rate-limited user refuse on mention; other user still starts session.
- Slash: muted/rate-limited after channel gate; channel deny still wins first.
- No live Discord token; allowlists remain default-deny.
- Lane: `fledge lanes run verify --non-interactive` (lint + smoke + test + spec-check).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-010 | `tests/discord.rate-mute.test.ts` + router/slash fixtures: per-user rate limit + mute independence; env defaults; no ProcessManager |

## Automated coverage

- `bun test tests/discord.rate-mute.test.ts tests/discord.router.test.ts tests/discord.slash.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/discord/context.md`
