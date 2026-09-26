---
module: discord
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
---

# Delta — discord (strict IDENTITY-2: owner-only ADMIN)

## Modified

### REQUIREMENT REQ-discord-042

Corvidinho SHALL load a durable owner record from bot-VM config (IDENTITY-1,
ALLOW-4): a Discord user snowflake plus optional GitHub login and display
name, from env `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`,
`CORVIDINHO_OWNER_DISPLAY` and/or an `[owner]` section (`discord_id`,
`github_login`, `display`) in the allowlist file. Env SHALL override the file
per field. The record is re-read on every start, so it survives restarts.
The owner SHALL be matched only by Discord snowflake or case-insensitive
GitHub login, never by display name.

ADMIN SHALL be owner-only (IDENTITY-2, Leif decision on #42). At handler time
(ADMIN-4 / DISCORD-7) `resolvePermissionLevel` SHALL return ADMIN only for
the owner's Discord id, and not when the owner is muted or on the Discord deny
list. `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` SHALL NOT grant ADMIN. A
missing, blank, or non-snowflake owner id SHALL mean no owner, and with no
owner nobody is ADMIN (IDENTITY-3). When the legacy admin lists are set, or no
owner is configured, the bridge SHALL log a start-up warning that never echoes
ids.

Ephemeral `/status` and `corvidinho doctor` SHALL show whether an owner is
configured plus the display name only, never ids, logins, or tokens.

Acceptance Criteria
- Env and allowlist-file `[owner]` load the owner; env wins per field; reloading the same config yields the same owner.
- The owner matches by Discord snowflake or lowercased GitHub login; the display name never matches.
- The owner resolves to ADMIN; a muted or deny-listed owner does not.
- Admin user/role lists never resolve to ADMIN, with or without an owner; no owner ⇒ nobody ADMIN and admin slash (/mute) is refused for everyone.
- Bridge start warns when the legacy admin lists are set or no owner is configured.
- `/status` (ephemeral) and `corvidinho doctor` show owner configured yes/no plus the display name only.
- Fixture tests only; no live Discord token or network.
