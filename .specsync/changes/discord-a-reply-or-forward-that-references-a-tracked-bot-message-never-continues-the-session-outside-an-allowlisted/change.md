---
id: discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted
state: implementing
type: bug_fix
base_commit: dc65cf70d4a46d59c35f80acd91822df3eddf3f1
---

# Discord: a reply or forward that references a tracked bot message never continues the session outside an allowlisted channel (DISCORD-5, DISCORD-DENY-1)

## Intent

Discord: a reply or forward that references a tracked bot message never continues the session outside an allowlisted channel (DISCORD-5, DISCORD-DENY-1)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A message in a non-allowlisted channel that references a tracked bot message from an allowlisted channel (a Discord forward, or any reference) is silent: no session continue, no agent spawn, no embed/edit/reply posted there. The gateway drops forward-type references and references whose channel is not the message's own channel (or its thread parent). A reply in the same allowlisted channel still continues the session, and a thread under an allowlisted parent still continues its session.
- An ask button press resumes a session only in an allowlisted channel (or the session's thread under an allowlisted parent) and only while the session's own channel is still allowlisted; otherwise the ack is ephemeral only (allowlist tip for an admin, zero-width for anyone else), the ask stays pending, and nothing is run, sent or edited.

## No-spec Rationale

Not applicable
