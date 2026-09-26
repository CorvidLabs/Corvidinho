---
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
artifact: testing
---

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
