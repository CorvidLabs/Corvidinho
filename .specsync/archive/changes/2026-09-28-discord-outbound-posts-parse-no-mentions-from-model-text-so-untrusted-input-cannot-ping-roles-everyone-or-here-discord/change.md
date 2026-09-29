---
id: discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord
state: archived
type: bug_fix
base_commit: 24bba834d5780191bd40ee751eb5409eb2b84ba2
---

# Discord outbound posts parse no mentions from model text so untrusted input cannot ping roles, @everyone or @here (DISCORD-8)

## Intent

Discord outbound posts parse no mentions from model text so untrusted input cannot ping roles, @everyone or @here (DISCORD-8)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A chat reply (mention and reply-continue) whose summary contains @everyone, @here, <@&id> and <@id> is sent with allowedMentions.parse empty, no roles/users, repliedUser true, and no literal @everyone/@here; /session start and /work deferred public replies and ephemeral slash replies carry parse empty and defanged text; live client default, thinking embeds, editMessage, ask-button replies/updates, and schedule tick posts carry parse []; an ask post allows exactly the users it names; discord-post-message sends allowed_mentions parse [] and defanged text; fixture tests inject fake discord.js into the live gateway and stub fetch for the plugin with no live Discord or network.

## No-spec Rationale

Not applicable
