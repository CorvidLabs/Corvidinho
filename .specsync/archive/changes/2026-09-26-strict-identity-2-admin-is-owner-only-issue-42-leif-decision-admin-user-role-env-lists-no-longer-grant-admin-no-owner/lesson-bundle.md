# Lesson bundle — strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set
- **Kind**: Feature
- **Specs**: discord, plugins, cli
- **Paths**: src/discord/permissions.ts, src/discord/bridge.ts, src/discord/config.ts, src/discord/slash-types.ts, plugins/memory/commands.ts, src/cli.ts, tests, docs
- **Acceptance**: resolvePermissionLevel returns ADMIN only for the configured owner (unless muted/deny-listed); CORVIDINHO_DISCORD_ADMIN_USERS/_ROLES never grant ADMIN in the bridge or the memory handler; no owner means nobody ADMIN; bridge start and doctor warn when the legacy lists are set without echoing ids; fixture tests cover all of this

## Evidence

- Verification commit: `643045504b50040e1a1b48bc6cc5beb9d6c3985e`
- Base commit: `a49987d653499f40af938f26961c98e017c7777b`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

PR #138 shipped the durable owner record (IDENTITY-1) and made the owner
ADMIN, but deliberately kept `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES`
working so it would not break existing deployments. On issue #42 Leif then
confirmed "IDENTITY-2 (owner-only admin) stays": hi/identity.md IDENTITY-2
says only the configured owner may use admin slash commands, and IDENTITY-3
says an empty owner config means nobody is admin.

This change makes that strict. It is a breaking ops change: a deployment that
relied on the admin env lists and has no owner configured goes to
nobody-is-ADMIN (default-deny) until `CORVIDINHO_OWNER_DISCORD_ID` (or
allowlist `[owner].discord_id`) is set.

## From the change's design.md

# Design

- `resolvePermissionLevel` (src/discord/permissions.ts): the only ADMIN path
  is `isOwnerDiscord(opts.owner, opts.userId)`, after the muted / deny-list
  BLOCKED checks. The admin user/role branches are removed. The
  `adminUserIds` / `adminRoleIds` option fields stay (documented as ignored)
  so callers and config parsing keep compiling; this keeps the diff small.
- Memory handler re-check (`actingIsAdmin` in plugins/memory/commands.ts):
  still requires the bridge's per-dispatch `CORVIDINHO_ACTING_IS_ADMIN=1`,
  then requires the acting user to be the owner loaded from the same env /
  allowlist file as the bridge; muted / deny-listed never ADMIN; any load
  error fails closed. Admin lists are no longer read.
- Operator visibility: the bridge logs a start-up warning when the legacy
  lists are set, and another when no owner is configured. `corvidinho doctor`
  adds a `[warn] admin-lists` line when either list is set; it never echoes
  ids and never changes the exit code.
- No schema change, no new slash command, no new env var.

## From the change's testing.md

# Testing

- tests/discord.admin-reauth.test.ts: owner → ADMIN; admin user/role lists
  alone → STANDARD; admin role no longer grants /mute; no owner ⇒ /mute
  refused for everyone.
- tests/discord.owner.test.ts: lists alongside an owner do not grant ADMIN;
  no owner ⇒ nobody ADMIN even with lists.
- tests/memory.plugins.test.ts: owner + bridge bit may forget; admin
  user/role lists + bit refused; deny-listed / muted owner refused; owner
  without the bit refused; actor binding holds when the owner changes.
- tests/identity.owner.test.ts: doctor prints `[warn] admin-lists` without
  ids and the exit code is unchanged.
- announce / schedule / slash fixtures now configure an owner instead of
  admin lists.
- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
  `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
