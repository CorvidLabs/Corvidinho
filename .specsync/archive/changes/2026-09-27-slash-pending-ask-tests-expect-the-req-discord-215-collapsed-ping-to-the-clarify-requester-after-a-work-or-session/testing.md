---
change: slash-pending-ask-tests-expect-the-req-discord-215-collapsed-ping-to-the-clarify-requester-after-a-work-or-session
artifact: testing
---

# Testing

- `bun test tests/discord.slash-pending-ask.test.ts`: 12 pass, 0 fail.
- Without the ping (or with a second one) the new `bridge.pings` length
  assertion fails, so the REQ-discord-215 slash ping stays covered.
- Full `bun test`, `specsync change audit`, `specsync check
  --require-coverage 100` and `fledge lanes run verify --non-interactive`.
