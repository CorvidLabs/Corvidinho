---
id: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
state: archived
type: bug_fix
base_commit: cf8c6768df9330074f41c2ceba29d70208e9518e
---

# Discord: an ask button press passes the actor gate and mute/rate limit like chat and slash, so a muted or deny-listed user cannot keep a session going by buttons (REQ-discord-201, REQ-discord-010, DISCORD-6, ALLOW-5)

## Intent

Discord: an ask button press passes the actor gate and mute/rate limit like chat and slash, so a muted or deny-listed user cannot keep a session going by buttons (REQ-discord-201, REQ-discord-010, DISCORD-6, ALLOW-5)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- An ask button press (open or pick) in an allowlisted channel runs, after the channel gate, the same actor gate and mute/rate limit as chat and slash: a deny-listed user or role, or an actor not on a non-empty user/role allowlist (owner excepted), gets only the ephemeral zero-width ack; a muted user gets ephemeral MUTED; a user over the rate limit (shared with chat and slash, keyed on the presser's resolved permission level) gets ephemeral RATE_LIMITED. On every refusal the agent does not run, nothing is sent or edited, and the pending ask stays as it was, so the owner can still answer it once allowed; the gateway passes the presser's role ids so role allow/deny applies, and an allowed press still resumes (DISCORD-ASK-3).

## No-spec Rationale

Not applicable
