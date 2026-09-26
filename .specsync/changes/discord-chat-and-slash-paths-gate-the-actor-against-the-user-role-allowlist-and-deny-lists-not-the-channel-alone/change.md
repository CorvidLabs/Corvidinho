---
id: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
state: draft
type: bug_fix
base_commit: 65cff62fdae8cb0413d92adfe8acb29455fc127f
---

# Discord chat and slash paths gate the actor against the user/role allowlist and deny lists, not the channel alone

## Intent

Discord chat and slash paths gate the actor against the user/role allowlist and deny lists, not the channel alone

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- With a non-empty user or role allowlist, a deny-listed or unlisted member of an allowlisted channel cannot start or continue a chat session (mention, reply, thread) or run any slash command; chat refusal is silent and slash refusal is an ephemeral zero-width ack; deny lists always win; listed users, allowed roles and the owner keep access; empty user+role lists keep the channel-only path

## No-spec Rationale

Not applicable
