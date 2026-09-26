---
change: hear-rate-limits-mutes-discord-6-steal-from-corvid-agent-per-user-sliding-window-mute-set-fixture-tests-no
artifact: plan
---

# Plan

1. Add `checkRateLimit` / `muteUser` / `unmuteUser` / `isMuted` to permissions
   (ancestor shape) + RateLimitConfig/State types + reply constants.
2. Extend BridgeConfig + loadBridgeConfig with window/max/muted seed env knobs.
3. Wire mute + rate limit into message-router (start/continue) and slash-dispatch.
4. Bridge holds mutedUsers Set + timestamp Map; export mute/unmute for tests.
5. Fixture tests (permissions + router + slash) — per-user independence, no live token.
6. SpecSync discord delta + companion updates; STATUS Done row for #12.
7. `fledge lanes run verify --non-interactive` then review/finalize/archive.
