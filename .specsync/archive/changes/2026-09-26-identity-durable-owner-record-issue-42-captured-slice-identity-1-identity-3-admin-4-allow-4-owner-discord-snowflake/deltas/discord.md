---
module: discord
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
---

# Delta — discord (IDENTITY owner record)

## Added

### REQUIREMENT REQ-discord-042

Corvidinho SHALL load a durable owner record from bot-VM config (IDENTITY-1,
ALLOW-4): a Discord user snowflake plus optional GitHub login and display
name, from env `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`,
`CORVIDINHO_OWNER_DISPLAY` and/or an `[owner]` section (`discord_id`,
`github_login`, `display`) in the allowlist file. Env SHALL override the file
per field. The record is re-read on every start, so it survives restarts.
The owner SHALL be matched only by Discord snowflake or case-insensitive
GitHub login, never by display name.

At handler time (ADMIN-4 / DISCORD-7) `resolvePermissionLevel` SHALL return
ADMIN for the owner's Discord id unless the owner is muted or on the Discord
deny list. The existing `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` lists
SHALL keep working unchanged. A missing, blank, or non-snowflake owner id
SHALL mean no owner and SHALL NOT change admin behavior, so an empty owner
with empty admin lists still leaves nobody ADMIN (IDENTITY-3 owner path).

Ephemeral `/status` and `corvidinho doctor` SHALL show whether an owner is
configured plus the display name only, never ids, logins, or tokens. Making
the owner the only admin (strict IDENTITY-2) is not part of this requirement.

Acceptance Criteria
- Env and allowlist-file `[owner]` load the owner; env wins per field; reloading the same config yields the same owner.
- The owner matches by Discord snowflake or lowercased GitHub login; the display name never matches.
- The owner resolves to ADMIN; a muted or deny-listed owner does not.
- Empty or invalid owner config leaves the admin env lists and default-deny unchanged.
- `/status` (ephemeral) and `corvidinho doctor` show owner configured yes/no plus the display name only.
- Fixture tests only; no live Discord token or network.
