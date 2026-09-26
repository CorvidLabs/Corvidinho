---
id: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
state: archived
type: bug_fix
base_commit: 65cff62fdae8cb0413d92adfe8acb29455fc127f
---

# Dogfood UX: Discord identity inject (IDENTITY-4), thinking embed model+plumbing (DISCORD-3.a), clean chat replies, community public GitHub gate (ROLES-CHAT-8); package 0.0.18

## Intent

Dogfood UX: Discord identity inject (IDENTITY-4), thinking embed model+plumbing (DISCORD-3.a), clean chat replies, community public GitHub gate (ROLES-CHAT-8); package 0.0.18

## Affected Canonical Specs

- `discord`
- `agent`
- `plugins`

## Acceptance Criteria

- IDENTITY-4: Discord injects acting user id + display (owner map wins for owner; never invents names like Kyn); memory stays scoped to acting user. DISCORD-3.a: thinking embed shows model + session + state/verified/verifySkipped/attempts in footer; final Discord chat reply is human text only with no plumbing lines. ROLES-CHAT-8: non-ADMIN community sessions may use any public GitHub (+ site/roadmap via web-fetch); private repos and secret paths (.env/keys) refused; deny lists still win; ADMIN keeps GITHUB-6 allowlist. Package 0.0.18; fixture tests green.

## No-spec Rationale

Not applicable
