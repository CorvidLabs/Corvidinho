---
change: memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user
artifact: testing
---

# Testing

- Store conversation/entity/person/personality; recall by owner/category.
- Soft-delete forget by ADMIN; non-admin self-forget denied; cross-user deny
  without leaking content.
- Empty admin ⇒ forget/override denied.
- Override by ADMIN updates content; reopen DB reloads (MEMORY-4).
- Schema version = 3 after migrate.
- Plugin list includes memory-* ; forget without --confirm / without admin fails.
- `corvidinho version` / package.json print 0.0.4.
- No live Discord; `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-019 | `tests/discord.session-store.durable.test.ts` still green; shared DB schema v3 coexists with SESSION |
| REQ-discord-021 | `tests/memory.store.test.ts` — schema v3, CRUD categories, ACL deny, admin forget/override, reload |
| REQ-plugins-010 | `tests/memory.plugins.test.ts` — list danger markings; store/recall; forget needs --confirm + admin |
| REQ-cli-011 | `tests/version.test.ts` + `tests/update-helpers.test.ts` — package.json / VERSION / CHANGELOG 0.0.4 |

## Automated coverage

- `bun test tests/memory.store.test.ts tests/memory.plugins.test.ts tests/version.test.ts tests/update-helpers.test.ts tests/discord.session-store.durable.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord --spec plugins --spec cli`
- `fledge lanes run verify --non-interactive`
