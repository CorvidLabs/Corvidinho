---
id: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
state: implementing
type: feature
base_commit: 1b69c1fa30e33c64a52174a968583323c20658a8
---

# IDENTITY durable owner record (issue #42 captured slice IDENTITY-1/IDENTITY-3 + ADMIN-4 + ALLOW-4): owner Discord snowflake plus optional GitHub login and display from bot-VM env CORVIDINHO_OWNER_* or allowlist file [owner] section (env overrides file); owner resolves to ADMIN at handler time unless deny-listed or muted; existing admin env lists unchanged; empty owner means no owner; ephemeral /status and doctor show owner configured yes/no plus display only; strict owner-only admin (IDENTITY-2) left for Leif

## Intent

IDENTITY durable owner record (issue #42 captured slice IDENTITY-1/IDENTITY-3 + ADMIN-4 + ALLOW-4): owner Discord snowflake plus optional GitHub login and display from bot-VM env CORVIDINHO_OWNER_* or allowlist file [owner] section (env overrides file); owner resolves to ADMIN at handler time unless deny-listed or muted; existing admin env lists unchanged; empty owner means no owner; ephemeral /status and doctor show owner configured yes/no plus display only; strict owner-only admin (IDENTITY-2) left for Leif

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- Owner record (Discord snowflake + optional GitHub login + display) loads from bot-VM env CORVIDINHO_OWNER_DISCORD_ID / CORVIDINHO_OWNER_GITHUB_LOGIN / CORVIDINHO_OWNER_DISPLAY and/or the allowlist file [owner] section (TOML or JSON), env overriding file per field, re-read on every start so it survives restarts (IDENTITY-1, ALLOW-4); owner matches only by Discord snowflake or lowercased GitHub login, never by display name; resolvePermissionLevel returns ADMIN for the owner at handler time unless deny-listed or muted, while CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES keep working unchanged (ADMIN-4); empty or invalid owner config means no owner and leaves admin behavior unchanged, so empty owner plus empty admin lists is still nobody ADMIN (IDENTITY-3 owner path, ADMIN-4); ephemeral /status and corvidinho doctor show owner configured yes/no plus display name only, never ids or tokens; fixture tests cover env vs file precedence, snowflake match, case-insensitive login, display never matches, owner ADMIN, deny-listed/muted owner not ADMIN, empty owner no change; strict owner-only admin (IDENTITY-2) left for Leif; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
