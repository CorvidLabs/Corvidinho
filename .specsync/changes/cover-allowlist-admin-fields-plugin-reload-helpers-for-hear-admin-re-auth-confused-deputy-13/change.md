---
id: cover-allowlist-admin-fields-plugin-reload-helpers-for-hear-admin-re-auth-confused-deputy-13
state: implementing
type: bug_fix
base_commit: 2d22201fb2a75e3b8c8ed87b3e343bfb51a84ed4
---

# Cover allowlist admin fields + plugin reload helpers for HEAR admin re-auth / confused-deputy (#13)

## Intent

Cover allowlist admin fields + plugin reload helpers for HEAR admin re-auth / confused-deputy (#13)

## Affected Canonical Specs

- None

## Acceptance Criteria

- Support paths for #13: DiscordAllowlists.adminUsers/adminRoles + load/env overlays; builtins/plugin loaders re-register after clearRegistry so fixture tests stay green. No new HI; covered by discord REQ-011/012.

## No-spec Rationale

Allowlist admin_users/admin_roles fields and plugin reload-after-clearRegistry are support paths for DISCORD-7/8; no new canonical module — covered by active discord change REQ-011/012
