---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: testing
---

# Testing

- tests/discord.admin-reauth.test.ts: owner → ADMIN; admin user/role lists
  alone → STANDARD; admin role no longer grants /mute; no owner ⇒ /mute
  refused for everyone.
- tests/discord.owner.test.ts: lists alongside an owner do not grant ADMIN;
  no owner ⇒ nobody ADMIN even with lists.
- tests/memory.plugins.test.ts: owner + bridge bit may forget; admin
  user/role lists + bit refused; deny-listed / muted owner refused; owner
  without the bit refused; actor binding holds when the owner changes.
- tests/identity.owner.test.ts: doctor prints `[warn] admin-lists` without
  ids and the exit code is unchanged.
- announce / schedule / slash fixtures now configure an owner instead of
  admin lists.
- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
  `fledge lanes run verify --non-interactive`.
