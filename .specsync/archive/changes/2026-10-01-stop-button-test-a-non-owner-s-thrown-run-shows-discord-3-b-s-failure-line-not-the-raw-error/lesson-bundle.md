# Lesson bundle — stop-button-test-a-non-owner-s-thrown-run-shows-discord-3-b-s-failure-line-not-the-raw-error

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Stop-button test: a non-owner's thrown run shows DISCORD-3.b's failure line, not the raw error
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: tests/discord.stop-run.test.ts
- **Acceptance**: tests/discord.stop-run.test.ts 'a failed run's answer clears the button too, and so does the failure status when the run throws' expects Alice's (non-owner) thrown-run failure status to read the DISCORD-3.b line FAILED_TEXT ('That didn't work.', no owner DM in that harness) instead of the raw error, still asserts the Stop button clears (REQ-discord-303), and passes on the merged branch; specsync change audit reports no uncovered meaningful paths.

## Evidence

- Verification commit: `a6bd22a79f0fdc9738ad2536e5a8f255b8062c19`
- Base commit: `7f46a09de7c9133a10a2b8d07e5afd0dd888b1b8`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Merging main into `claude/m2-failed-reply-reason` (PR #340, DISCORD-3.b) brought in
main's AGENT-3.a Stop-button test (#337). Its case "a failed run's answer clears the
button too, and so does the failure status when the run throws" asserted that Alice's
failure status reads the thrown error verbatim (`❌ spawn failed`). With DISCORD-3.b,
only the owner sees a failed run's reason; Alice is not the owner and the test harness
sends no owner DM, so her status reads `❌ That didn't work.` (`FAILED_TEXT`).

The test now expects `❌ ${FAILED_TEXT}` and keeps every Stop-button assertion
(REQ-discord-303: the button clears on a failed answer and on a thrown run). Canonical
spec text is unchanged; DISCORD-3.b's own change (this PR) carries the behavior.

## From the change's testing.md

# Testing

- `bun test tests/discord.stop-run.test.ts` passes (27 pass, 0 fail) on the merged branch.
- `bun test tests/discord.failed-reply.test.ts` stays green.
- `specsync change audit` reports no uncovered meaningful paths.
- `fledge lanes run verify --non-interactive` remains green.

## Where these lessons go

- `specs/discord/context.md`
