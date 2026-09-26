---
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
artifact: testing
---

# Testing

- Unit: resolvePermissionLevel — admin user/role → ADMIN; muted/deny → BLOCKED;
  empty admin → never ADMIN.
- Slash: non-admin `/mute` refused with not-authorized; admin mute mutates set;
  channel deny still wins first; Discord UI alone cannot skip re-check.
- Requester: evaluateRequesterCanSend — missing channel 404; not in guild /
  cannot send 403; View+Send → ok.
- Plugin: requesting_user_id + deny checker → refuse, no post; allow → dry-run
  ok; strict mode missing requester → refuse.
- No live Discord token; allowlists remain default-deny.
- Lane: `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-011 | `tests/discord.admin-reauth.test.ts` — minPermission re-check on mute/unmute |
| REQ-discord-012 | `tests/discord.requester-perms.test.ts` + post plugin fixtures — confused-deputy |

## Automated coverage

- `bun test tests/discord.admin-reauth.test.ts tests/discord.requester-perms.test.ts tests/discord.post.plugin.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`
