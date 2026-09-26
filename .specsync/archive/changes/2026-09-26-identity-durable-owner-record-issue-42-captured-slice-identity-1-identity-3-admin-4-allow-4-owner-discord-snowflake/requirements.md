---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: requirements
---

# Requirements

1. **Owner record** (IDENTITY-1, ALLOW-4): Discord snowflake (required for an
   owner to exist) plus optional GitHub login and display name.
   - Env: `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`,
     `CORVIDINHO_OWNER_DISPLAY`.
   - File: `[owner]` section (`discord_id`, `github_login`, `display`) in the
     same allowlist file the bridge already loads (`CORVIDINHO_ALLOWLIST_FILE`
     or `~/.config/corvidinho/allowlist.toml|json`).
   - Env overrides file per field. Read on every start (survives restarts).
2. **Matching**: by Discord snowflake (exact, digits only) or GitHub login
   (trimmed, leading `@` dropped, case-insensitive). The display name never
   matches anything.
3. **Permission** (ADMIN-4): `resolvePermissionLevel` returns ADMIN for the
   owner's Discord id at handler time unless the owner is muted or on the
   Discord deny list. `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` keep working
   unchanged.
4. **Empty owner** (IDENTITY-3 owner path): a missing, blank, or non-snowflake
   Discord id means no owner; no admin behavior changes. Empty owner plus empty
   admin lists is still nobody ADMIN.
5. **Visibility**: ephemeral `/status` and `corvidinho doctor` print
   "owner configured: yes/no" plus the display name only, never ids, logins,
   or tokens. Doctor reports config problems (e.g. non-snowflake id) without
   echoing values; a missing owner does not fail doctor.
6. No new slash commands, no DB schema change, no owner-only admin.
