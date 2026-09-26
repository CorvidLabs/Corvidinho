---
id: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
state: verifying
type: bug_fix
base_commit: 6cb5f18ab909f4bc5e6529b8c29df121e0833c4e
---

# Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env

## Intent

Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env

## Affected Canonical Specs

- `plugins`
- `discord`
- `watch`

## Acceptance Criteria

- Memory plugins refuse --user/--admin/--db argv so the model cannot assert identity, ADMIN, or store path (MEMORY-ACL-1/2/3); acting user comes only from CORVIDINHO_ACTING_DISCORD_USER_ID (missing => refuse); ADMIN for forget/override/include-deleted is re-checked in the handler: acting user in CORVIDINHO_DISCORD_ADMIN_USERS, or bridge-set CORVIDINHO_ACTING_IS_ADMIN only when admin roles are configured; empty admin lists => deny-all even with the env bit; denied/muted users never ADMIN (ADMIN-4 / MEMORY-ACL-4); self-forget still ADMIN-only; forget/override are two-phase (SAFE-4): phase 1 returns an HMAC confirm token bound to op+actor+memory id+row updated_at(+content hash) with 10m expiry and no memory content, phase 2 --confirm <token> must come from a different process/turn and is single-use; recall --include-deleted ADMIN-only; Discord spawn always overwrites CORVIDINHO_ACTING_* and WATCH spawn clears them; no schema change; no new slash; fixture tests + SpecSync + fledge verify green

## No-spec Rationale

Not applicable
