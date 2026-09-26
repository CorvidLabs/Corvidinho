# Lesson bundle — identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: IDENTITY durable owner record (issue #42 captured slice IDENTITY-1/IDENTITY-3 + ADMIN-4 + ALLOW-4): owner Discord snowflake plus optional GitHub login and display from bot-VM env CORVIDINHO_OWNER_* or allowlist file [owner] section (env overrides file); owner resolves to ADMIN at handler time unless deny-listed or muted; existing admin env lists unchanged; empty owner means no owner; ephemeral /status and doctor show owner configured yes/no plus display only; strict owner-only admin (IDENTITY-2) left for Leif
- **Kind**: Feature
- **Specs**: discord, cli
- **Paths**: src/identity/, src/discord/permissions.ts, src/discord/config.ts, src/discord/types.ts, src/discord/slash-types.ts, src/discord/slash-dispatch.ts, src/discord/bridge.ts, src/discord/command-handlers/, src/cli.ts, allowlist.example.toml, .env.example, docs/DISCORD-GO-LIVE.md, docs/discord.md, tests/identity.owner.test.ts, tests/discord.owner.test.ts, tests/cli.smoke.test.ts, specs/discord/, specs/cli/
- **Acceptance**: Owner record (Discord snowflake + optional GitHub login + display) loads from bot-VM env CORVIDINHO_OWNER_DISCORD_ID / CORVIDINHO_OWNER_GITHUB_LOGIN / CORVIDINHO_OWNER_DISPLAY and/or the allowlist file [owner] section (TOML or JSON), env overriding file per field, re-read on every start so it survives restarts (IDENTITY-1, ALLOW-4); owner matches only by Discord snowflake or lowercased GitHub login, never by display name; resolvePermissionLevel returns ADMIN for the owner at handler time unless deny-listed or muted, while CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES keep working unchanged (ADMIN-4); empty or invalid owner config means no owner and leaves admin behavior unchanged, so empty owner plus empty admin lists is still nobody ADMIN (IDENTITY-3 owner path, ADMIN-4); ephemeral /status and corvidinho doctor show owner configured yes/no plus display name only, never ids or tokens; fixture tests cover env vs file precedence, snowflake match, case-insensitive login, display never matches, owner ADMIN, deny-listed/muted owner not ADMIN, empty owner no change; strict owner-only admin (IDENTITY-2) left for Leif; SpecSync + fledge verify green

## Evidence

- Verification commit: `6a3f46a7f1425eaf012619495465a39eb24bfd82`
- Base commit: `1b69c1fa30e33c64a52174a968583323c20658a8`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Issue #42 (M1 "Knows everyone", build step 1). Corvidinho has no durable owner
record: admin-shaped slash commands only know the DISCORD-7 env lists
`CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`, and nothing in config says who
Leif is. `hi/identity.md` captures **IDENTITY-1..3**; `hi/admin.md`
**ADMIN-4** (handler-time re-check, empty owner/admin = nobody ADMIN) and
`hi/allow.md` **ALLOW-4** (config on the bot VM: file and/or env) apply.

IDENTITY-2 ("only the configured owner may use admin slash commands") is
disputed in the #42 thread: Leif's role decision (#65) and the follow-up
"IDENTITY-2 stays" comment leave the reconciliation with the existing admin
env lists open. This change builds only what is valid under either reading:
a durable owner record that resolves to ADMIN. Making the owner the *only*
admin (and "empty owner means nobody is admin" even when the admin env lists
are set) is a breaking change for existing deployments and is left for Leif.

Out of scope (draft / not captured): owner memory notes, AlgoChat address and
wallets (#36), Approve/Deny DM cards (#96), stuck pings (#44), role tiers
(#65, draft IDENTITY-8..12), on-chain identity.

## From the change's design.md

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

## From the change's testing.md

# Testing

- `tests/identity.owner.test.ts`: TOML/JSON `[owner]` parsing (quoted, bare,
  comments, `#` inside quotes), env over file per field, env-only, file-only,
  invalid or numeric-JSON snowflake means no owner with a value-free issue,
  GitHub-login-only means no owner, snowflake match, case-insensitive login
  with optional `@`, display never matches, `formatOwnerStatus`, reload from
  the same file (restart).
- `tests/discord.owner.test.ts`: `resolvePermissionLevel` owner is ADMIN;
  deny-listed or muted owner is BLOCKED; empty owner leaves the admin env lists
  and empty-list default-deny unchanged; `/mute` dispatch allowed for the owner
  and refused for a non-owner; `/status` ephemeral owner line without ids;
  `loadBridgeConfig` carries the owner from a temp allowlist file; bridge
  `actingIsAdmin` is true for the owner on chat spawn (dry run, temp
  projectRoot).
- Doctor (REQ-cli-042): `tests/identity.owner.test.ts` spawns
  `bun src/cli.ts doctor` with a temp HOME / allowlist file and asserts the
  owner line shows yes plus display (no id or login), and "no" when unset.
- `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-042 | `tests/identity.owner.test.ts`, `tests/discord.owner.test.ts` |
| REQ-cli-042 | `tests/identity.owner.test.ts` (doctor subprocess) |

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
