---
id: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
state: implementing
type: feature
base_commit: a49987d653499f40af938f26961c98e017c7777b
---

# Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set

## Intent

Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set

## Affected Canonical Specs

- `discord`
- `plugins`
- `cli`

## Acceptance Criteria

- resolvePermissionLevel returns ADMIN only for the configured owner (unless muted/deny-listed); CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES never grant ADMIN in the bridge or the memory handler; no owner means nobody ADMIN; bridge start and doctor warn when the legacy lists are set without echoing ids; fixture tests cover all of this

## No-spec Rationale

Not applicable
