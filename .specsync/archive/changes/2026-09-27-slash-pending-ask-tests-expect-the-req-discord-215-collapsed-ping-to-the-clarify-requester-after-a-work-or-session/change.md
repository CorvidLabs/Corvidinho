---
id: slash-pending-ask-tests-expect-the-req-discord-215-collapsed-ping-to-the-clarify-requester-after-a-work-or-session
state: archived
type: bug_fix
base_commit: 35c9ce1d560a96263f4c30189ba2d0acae3d502b
---

# Slash pending-ask tests expect the REQ-discord-215 collapsed ping to the clarify requester after a /work or /session start answer

## Intent

slash pending-ask tests expect the REQ-discord-215 collapsed ping to the clarify requester after a /work or /session start answer

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- tests/discord.slash-pending-ask.test.ts passes with #216 and #220 both on main: a clarify /work answer is followed by exactly one '<@requester> ↑ question for you' ping (REQ-discord-215, AUTONOMY-4) and the thin-reply, cancel, other-user and stuck assertions (REQ-discord-044, AUTONOMY-1/5/6, SESSION-MULTI-1) count only replies to the answer.

## No-spec Rationale

Test-only: #216's slash pending-ask tests predate the REQ-discord-215 collapsed ping; the tests now set that ping aside and assert it, no spec or source behaviour changes.
