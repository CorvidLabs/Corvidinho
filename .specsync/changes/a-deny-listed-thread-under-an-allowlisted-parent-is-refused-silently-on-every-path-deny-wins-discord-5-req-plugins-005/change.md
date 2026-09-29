---
id: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
state: implementing
type: bug_fix
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# A deny-listed thread under an allowlisted parent is refused silently on every path: deny wins (DISCORD-5, REQ-plugins-005)

## Intent

A deny-listed thread under an allowlisted parent is refused silently on every path: deny wins (DISCORD-5, REQ-plugins-005)

## Affected Canonical Specs

- `discord`
- `plugins`

## Acceptance Criteria

- With [discord].channels = [parent] and deny_channels = [thread], a message in that thread (an @mention, a plain thread continuation of an existing session, or a reply to a tracked bot message) is refused silently: routeMessage returns ignore / refuse with no reply, no session is started or continued, the agent is not run and nothing is posted, edited or deleted; componentChannelAllowlisted is false for a press in the thread and for any session whose thread or channel is deny-listed, so an ask button there gets only the ephemeral zero-width ack (the allowlist tip for an admin) and does not resume; a slash command in the thread gets only the ephemeral zero-width ack (tip for an admin); /schedule create with that thread as its channel is refused and a schedule whose channel is the thread neither runs nor posts at tick; restart recovery edits and replies nothing in a deny-listed thread (or under a deny-listed parent) and deletes its row; discord-send-file refuses a deny-listed thread even under an allowlisted parent and uploads nothing; a deny on the parent also wins over an allowlisted thread; isChannelDenied reports a deny_channels hit case-insensitively like checkChannel; an allowlisted parent without a deny still serves its threads (DISCORD-2.a); regression tests fail on the base and pass on the branch.

## No-spec Rationale

Not applicable
