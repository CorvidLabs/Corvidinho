---
change: stop-button-test-a-non-owner-s-thrown-run-shows-discord-3-b-s-failure-line-not-the-raw-error
artifact: testing
---

# Testing

- `bun test tests/discord.stop-run.test.ts` passes (27 pass, 0 fail) on the merged branch.
- `bun test tests/discord.failed-reply.test.ts` stays green.
- `specsync change audit` reports no uncovered meaningful paths.
- `fledge lanes run verify --non-interactive` remains green.
