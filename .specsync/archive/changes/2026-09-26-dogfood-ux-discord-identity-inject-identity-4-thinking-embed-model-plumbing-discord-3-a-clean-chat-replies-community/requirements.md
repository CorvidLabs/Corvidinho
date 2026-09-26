---
change: dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community
artifact: requirements
---

# Requirements

- REQ-discord-identity-4 / IDENTITY-4: Discord spawn/slash injects acting `discord_user_id` + display (owner map wins for owner; Discord display/username otherwise); never invents names; memory stays scoped to acting user.
- REQ-discord-3a / DISCORD-3.a: Thinking/progress embed footer shows model (when known), session id, and plumbing (`state`/`verified`/`verifySkipped`/`attempts`); final chat reply body is human text only.
- REQ-plugins-roles-8 / ROLES-CHAT-8: Non-ADMIN role sessions may use any *public* GitHub repo (deny lists still win); private/unknown visibility refused; secret-looking paths refused on files-read; ADMIN keeps GITHUB-6 allowlist.
- Package **0.0.18**; CHANGELOG + STATUS; fixture tests.
