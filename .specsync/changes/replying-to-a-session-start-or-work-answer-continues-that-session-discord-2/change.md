---
id: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
state: approved
type: bug_fix
base_commit: 6e5370dd5174f006ec16ffc609116c016055a7b8
---

# Replying to a /session start or /work answer continues that session (DISCORD-2)

## Intent

Replying to a /session start or /work answer continues that session (DISCORD-2)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Owner runs /session start (or /work) topic A, then topic B, then replies to A's answer: with or without the reply ping the run continues session A (resume), not B, and not nothing; the same holds when collapse fails and the answer lands in the deferred slash reply; another user's reply to A's answer never continues A (ping off: ignored; ping on: their own new session); tests/discord.slash-reply-continuity.test.ts covers all of these and fails on the previous code

## No-spec Rationale

Not applicable
