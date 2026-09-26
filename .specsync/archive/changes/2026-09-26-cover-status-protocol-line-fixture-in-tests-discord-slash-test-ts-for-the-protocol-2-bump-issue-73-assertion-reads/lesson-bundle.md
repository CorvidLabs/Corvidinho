# Lesson bundle — cover-status-protocol-line-fixture-in-tests-discord-slash-test-ts-for-the-protocol-2-bump-issue-73-assertion-reads

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover /status protocol-line fixture in tests/discord.slash.test.ts for the protocol 2 bump (issue #73); assertion reads CORVIDINHO_PROTOCOL_VERSION instead of a hard-coded 1; no module AC beyond REQ-discord-073
- **Kind**: BugFix
- **Paths**: tests/discord.slash.test.ts
- **Acceptance**: tests/discord.slash.test.ts /status fixture asserts Protocol: ${CORVIDINHO_PROTOCOL_VERSION} (2) instead of a literal 1 and passes; bun test + fledge verify green; no module AC beyond REQ-discord-073

## Evidence

- Verification commit: `5c347e0ec048ca02ec7a38764c17c87b1ef408f8`
- Base commit: `80e89c701bbdb527ad60fbe57e9300b44782da81`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Issue #73 bumps `CORVIDINHO_PROTOCOL_VERSION` from 1 to 2 so the Discord bridge
(DISCORD-10 lockstep) refuses a binary that cannot emit the
`task run --output ndjson` stream. The `/status reports metrics` fixture in
`tests/discord.slash.test.ts` asserted the literal `Protocol: 1`, so it failed
after the bump. The companion change
`live-ndjson-event-stream-for-bridges-issue-73-...` owns the behavior
(REQ-discord-073); this cover change only accounts for the fixture edit so the
SpecSync audit sees every changed path covered. No production code changes.

## From the change's testing.md

# Testing

- `bun test tests/discord.slash.test.ts`: `/status reports metrics` passes with
  protocol 2 and would keep passing on any later bump (reads the constant).
- Full `bun test` and `fledge lanes run verify --non-interactive` green.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
