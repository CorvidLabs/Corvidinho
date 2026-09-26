---
change: discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin
artifact: testing
---

# Testing

- Router: @mention non-allowlisted → refuse with no reply; no-mention → ignore;
  empty channels → refuse no reply.
- Slash: non-allowlisted non-admin → ok:false, ephemeral `\u200b` (or empty-useful),
  no tip text; admin → ephemeral ALLOWLIST_DENY_TIP.
- No live Discord token.
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-018 | `tests/discord.router.test.ts` + `tests/discord.slash.test.ts` deny paths |

## Automated coverage

- `bun test tests/discord.router.test.ts tests/discord.slash.test.ts tests/discord.admin-reauth.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
