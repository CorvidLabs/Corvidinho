---
id: discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping
state: approved
type: feature
base_commit: 0214ea613515b4b3af079459b42d5a47c036450e
---

# Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.27

## Intent

Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.27

## Affected Canonical Specs

- `discord`
- `agent`
- `plugins`

## Acceptance Criteria

- IDENTITY-5/DISCORD-13: read-only discord-user-lookup resolves snowflake/@mention/name within DISCORD_GUILD_ID only (refuse other guilds); agent prompt prefers Discord lookup then prose for social chat; SpecSync/git/github/files only when clearly Corvidinho code/product. AGENT-9: tool-round exhaustion returns best prose or a short clarify ask — never 'Stopped after N tool rounds' in Discord chat body (thinking/plumbing may note it). ROLES-CHAT-9: community chat prefers conversational reply. Package 0.0.27; fixture tests cover lookup gate, soft-land summary, and chatBody scrub.

## No-spec Rationale

Not applicable
