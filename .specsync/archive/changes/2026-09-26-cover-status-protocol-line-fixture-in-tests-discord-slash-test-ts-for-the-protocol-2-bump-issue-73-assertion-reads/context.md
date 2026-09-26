---
change: cover-status-protocol-line-fixture-in-tests-discord-slash-test-ts-for-the-protocol-2-bump-issue-73-assertion-reads
artifact: context
---

# Context

Issue #73 bumps `CORVIDINHO_PROTOCOL_VERSION` from 1 to 2 so the Discord bridge
(DISCORD-10 lockstep) refuses a binary that cannot emit the
`task run --output ndjson` stream. The `/status reports metrics` fixture in
`tests/discord.slash.test.ts` asserted the literal `Protocol: 1`, so it failed
after the bump. The companion change
`live-ndjson-event-stream-for-bridges-issue-73-...` owns the behavior
(REQ-discord-073); this cover change only accounts for the fixture edit so the
SpecSync audit sees every changed path covered. No production code changes.
