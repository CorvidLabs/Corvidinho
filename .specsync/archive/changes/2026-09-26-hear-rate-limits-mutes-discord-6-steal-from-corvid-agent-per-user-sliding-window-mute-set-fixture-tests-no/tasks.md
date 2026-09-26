---
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
artifact: tasks
---

# Tasks

- [x] permissions: checkRateLimit, mute/unmute/isMuted, rateLimitByLevel
- [x] config: DISCORD_RATE_LIMIT_* + DISCORD_MUTED_USER_IDS env knobs
- [x] message-router: mute + rate limit before start/continue
- [x] slash-dispatch: mute + rate limit after channel gate
- [x] bridge: hold state; wire deps; export helpers
- [x] Fixture tests (no live Discord token)
- [x] Discord SpecSync delta + companion updates
- [x] STATUS.md Done row for #12 (on merge)
- [x] `.env.example` / go-live docs note optional rate/mute knobs
- [x] `fledge lanes run verify --non-interactive`
