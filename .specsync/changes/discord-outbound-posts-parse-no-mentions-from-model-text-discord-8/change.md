---
id: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
state: draft
type: bug_fix
base_commit: 544fe131ad199fa46e0ff7ea573b83a920db0bbf
---

# Discord outbound posts parse no mentions from model text (DISCORD-8)

## Intent

Discord outbound posts parse no mentions from model text, so untrusted input
cannot make the bot ping a role, @everyone, @here or a user (DISCORD-8)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- No bridge outbound path (chat mention / reply-continue, /session start and /work replies, other slash replies, schedule and announce posts, thinking embeds, agent discord-post-message) can produce a role, @everyone, @here or user mention from model text: every payload sends allowedMentions.parse = [] (plus a client-wide default), @everyone / @here are defanged in the text, replies still ping the replied-to author, and the AUTONOMY-2 ask keeps its explicit owner-only allowance; fixture tests prove each path.

## No-spec Rationale

Not applicable
