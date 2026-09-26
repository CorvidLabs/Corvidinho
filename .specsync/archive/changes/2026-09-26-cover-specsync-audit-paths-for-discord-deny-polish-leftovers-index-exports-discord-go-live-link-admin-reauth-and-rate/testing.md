---
change: cover-specsync-audit-paths-for-discord-deny-polish-leftovers-index-exports-discord-go-live-link-admin-reauth-and-rate
artifact: testing
---

# Testing

## Local gates

- `specsync change audit` (must pass with this cover change active/archived on tip)
- `bun test tests/discord.admin-reauth.test.ts tests/discord.rate-mute.test.ts`
- `specsync check`

## CI

- Spec Sync Action + Bun smoke on PR #54

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| (no-spec) acceptance | Four leftover paths listed on this change; `specsync change audit` green |
