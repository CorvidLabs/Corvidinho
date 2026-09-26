---
change: cover-allowlist-admin-fields-plugin-reload-helpers-for-hear-admin-re-auth-confused-deputy-13
artifact: testing
---

# Testing

Covered by #13 fixture suite:

- `tests/discord.config.test.ts` — admin users/roles from env
- `tests/discord.requester-perms.test.ts` / `tests/discord.post.plugin.test.ts`
  — loadBuiltins after clearRegistry still finds discord-post-message
- `tests/allowlist.default-deny.test.ts` — empty admin lists still default-deny

No live Discord token. `fledge lanes run verify --non-interactive`.
