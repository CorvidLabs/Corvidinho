---
change: cover-allowlist-admin-fields-plugin-reload-helpers-for-hear-admin-re-auth-confused-deputy-13
artifact: context
---

# Context

Coverage change for support paths touched while shipping #13 (DISCORD-7/8):
`src/allowlist/types.ts` + `load.ts` (adminUsers/adminRoles default-deny fields)
and `src/plugins/builtins.ts` (+ sibling plugin loaders) so builtins re-register
after `clearRegistry()` in unrelated tests.

No new HI. Primary AC lives on the active discord change (REQ-discord-011/012).
