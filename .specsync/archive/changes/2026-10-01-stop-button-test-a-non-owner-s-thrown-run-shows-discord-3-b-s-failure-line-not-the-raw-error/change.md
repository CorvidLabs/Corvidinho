---
id: stop-button-test-a-non-owner-s-thrown-run-shows-discord-3-b-s-failure-line-not-the-raw-error
state: archived
type: bug_fix
base_commit: 7f46a09de7c9133a10a2b8d07e5afd0dd888b1b8
---

# Stop-button test: a non-owner's thrown run shows DISCORD-3.b's failure line, not the raw error

## Intent

Stop-button test: a non-owner's thrown run shows DISCORD-3.b's failure line, not the raw error

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- tests/discord.stop-run.test.ts 'a failed run's answer clears the button too, and so does the failure status when the run throws' expects Alice's (non-owner) thrown-run failure status to read the DISCORD-3.b line FAILED_TEXT ('That didn't work.', no owner DM in that harness) instead of the raw error, still asserts the Stop button clears (REQ-discord-303), and passes on the merged branch; specsync change audit reports no uncovered meaningful paths.

## No-spec Rationale

Test-only merge fix: main's AGENT-3.a Stop-button test asserted the thrown error verbatim on a non-owner's failure status; with DISCORD-3.b only the owner sees the reason. REQ-discord-303 (the button clears on a failed or thrown run) is unchanged, so no spec text changes.
