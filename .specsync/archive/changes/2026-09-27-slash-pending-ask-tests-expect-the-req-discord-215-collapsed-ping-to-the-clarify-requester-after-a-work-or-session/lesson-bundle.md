# Lesson bundle — slash-pending-ask-tests-expect-the-req-discord-215-collapsed-ping-to-the-clarify-requester-after-a-work-or-session

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Slash pending-ask tests expect the REQ-discord-215 collapsed ping to the clarify requester after a /work or /session start answer
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: tests/discord.slash-pending-ask.test.ts
- **Acceptance**: tests/discord.slash-pending-ask.test.ts passes with #216 and #220 both on main: a clarify /work answer is followed by exactly one '<@requester> ↑ question for you' ping (REQ-discord-215, AUTONOMY-4) and the thin-reply, cancel, other-user and stuck assertions (REQ-discord-044, AUTONOMY-1/5/6, SESSION-MULTI-1) count only replies to the answer.

## Evidence

- Verification commit: `7679caa0ebfb95a774c673abad1dddbf1c9e5e28`
- Base commit: `35c9ce1d560a96263f4c30189ba2d0acae3d502b`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

#216 (REQ-discord-044) landed on main with tests that count every post the
bridge makes after a `/work` or `/session start` clarify answer. #220
(REQ-discord-215, AUTONOMY-4, DISCORD-ASK-6/7) makes a collapsed answer that
mentions the clarify requester send one fresh ping post, since an edit never
notifies a mention. Merging main into #220 made three #216 tests see that
ping as an extra reply. The ping is intended (REQ-discord-215 covers chat,
button pick and slash answers), so the tests change; source and specs do not.

## From the change's testing.md

# Testing

- `bun test tests/discord.slash-pending-ask.test.ts`: 12 pass, 0 fail.
- Without the ping (or with a second one) the new `bridge.pings` length
  assertion fails, so the REQ-discord-215 slash ping stays covered.
- Full `bun test`, `specsync change audit`, `specsync check
  --require-coverage 100` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
