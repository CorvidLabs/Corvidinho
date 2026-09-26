---
change: cover-status-protocol-line-fixture-in-tests-discord-slash-test-ts-for-the-protocol-2-bump-issue-73-assertion-reads
artifact: testing
---

# Testing

- `bun test tests/discord.slash.test.ts`: `/status reports metrics` passes with
  protocol 2 and would keep passing on any later bump (reads the constant).
- Full `bun test` and `fledge lanes run verify --non-interactive` green.
