---
change: identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake
artifact: testing
---

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
