---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: design
---

# Design

- New `src/identity/owner.ts` (+ `src/identity/index.ts` barrel), owned by the
  `discord` spec:
  - `OwnerRecord { discordId; githubLogin?; display? }`.
  - `parseOwnerToml(text)`: scalar-aware reader for the `[owner]` section
    (quoted or bare values; `#` inside quotes kept). The shared
    `parseSimpleToml` splits values on whitespace and commas, which would
    mangle display names, so it is not reused; `src/allowlist` is untouched.
  - `ownerFieldsFromJson`: `owner` object in `.json` allowlist files; a numeric
    `discord_id` is rejected (JSON numbers lose snowflake precision).
  - `ownerFieldsFromEnv`, `resolveOwner(file, env)` (env wins per field;
    validation issues listed without values), `loadOwnerConfig` / `getOwner`
    (async; file path defaults to `resolveAllowlistPath`).
  - `isOwnerDiscord`, `isOwnerGithub`, `formatOwnerStatus`.
- `loadBridgeConfig` loads the owner from the allowlist's `sourcePath` (the
  file actually used) plus env and sets `BridgeConfig.owner`.
- `ResolvePermissionOpts.owner`, checked after mute/deny and before the admin
  lists. Every call site (dispatch, handlers, bridge chat spawn
  `actingIsAdmin`) passes `ctx.owner` / `config.owner`. A future call site
  that forgets it fails closed (the owner is simply not elevated there).
- `SlashContext.owner`; `formatStatusReport` gets an `ownerLine`.
- `corvidinho doctor` adds an informational `owner` line that never changes
  the exit code.
