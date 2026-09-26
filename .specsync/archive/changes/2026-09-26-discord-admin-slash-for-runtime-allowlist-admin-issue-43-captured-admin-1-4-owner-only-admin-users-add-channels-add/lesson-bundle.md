# Lesson bundle — discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord /admin slash for runtime allowlist admin (issue #43 captured ADMIN-1..4): owner-only /admin users add, channels add|remove, config show; persists to the allowlist file the bridge already reads (atomic temp+rename, other sections and comments kept) and updates the live allowlist without restart; env values read-only at runtime; empty stays deny-all; SAFE-5 audit rows for mutations
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord, tests, docs/discord.md, allowlist.example.toml
- **Acceptance**: Owner-only /admin slash (ADMIN minPermission plus an explicit handler-time re-check; no owner means nobody can run it) approves/adds Discord users (users add) and adds/removes channels (channels add|remove) in the allowlist file the bridge already reads, written atomically with other sections and comments kept, and the live allowlist updates without restart; env-sourced entries are reported read-only; deny-listed ids and removing the last live channel are refused; the first user entry warns that unlisted callers now resolve to BLOCKED; config show gives an ephemeral audit-friendly view (live/file/env counts, updatable knobs) with no secrets; mutations append SAFE-5 audit rows (fail closed when the trail is unavailable); gateway flattens subcommand groups; register count is nine; fixture tests only

## Evidence

- Verification commit: `e25e1f9a232ed9dcee03f5b2ba245f90c63a50e8`
- Base commit: `20fb34ff8db5759a2aad968e74d1d21b4c344b83`
- Verified by: `specsync check --spec agent --spec discord --spec plugins`

## From the change's context.md

# Context

Issue #43 asks for runtime Discord slash admin (approve/add users, add
channels, update config) beyond the shipped DISCORD-7 re-auth. Leif has
since captured ADMIN-1..4 in `hi/admin.md`; `docs/hi-drafts/ADMIN.md` is
historical provenance only. IDENTITY-2 (#141) made ADMIN owner-only:
`resolvePermissionLevel` returns ADMIN only for the configured owner, and no
owner means nobody is ADMIN.

Before this change the only way to add a user or channel was to SSH the bot
VM, edit `~/.config/corvidinho/allowlist.toml` (or env) and restart the
bridge. The DISCORD-DENY-2 admin tip still told the owner to do exactly that.

Constraints carried in: one store (the allowlist file/env the bridge already
reads, never a second DB table), empty = deny-all stays, env is not writable
at runtime, secrets never echoed, fixture tests only. Leif's planning comment
on #43 lists further admin needs (people/roles #36/#65, repo allowlist growth
draft ALLOW-7 #90, spend caps #98, audit verify #95, re-scrub #66); none is a
captured ADMIN criterion, so they stay out of this change.

## From the change's design.md

# Design

- **Surface:** one command, `/admin`, with subcommand groups `users add`,
  `channels add|remove`, `config show`. USER / CHANNEL pickers; ids are
  validated as digits-only snowflakes (which also keeps TOML/JSON output
  injection-free). Registered with `minPermission: ADMIN` in
  `slash-dispatch.ts`; `handleAdminCommand` re-checks ADMIN first.
- **Persistence (`src/discord/admin-allowlist.ts`):** path = the file the
  bridge loaded, else `CORVIDINHO_ALLOWLIST_FILE`, else the default
  `~/.config/corvidinho/allowlist.toml` (created 0600 / dir 0700).
  `planAdminListChange` reads the file synchronously and computes file
  before/after, the env list, and live after = file ∪ env (what a restart
  would load); unreadable/unparsable files refuse. `setTomlDiscordList`
  rewrites only `<key> = …` lines inside `[discord]` (collapsing multi-line
  arrays, keeping indentation and trailing comments) and adds the key or
  section when missing; `setJsonDiscordList` keeps every other key and
  refuses unsafe numeric ids. `writeFileAtomic` = temp file in the same dir,
  fsync, chmod to the old mode, rename; symlinks resolved first.
- **Live update:** `commitAdminListChange` splices `allowlist.discord.<key>`
  (and `channelIds` if it is a separate array) in place. Plan → audit
  `started` → commit is fully synchronous, so two admin commands in one
  bridge cannot interleave a read-modify-write.
- **Guards:** add refuses ids on the deny list (deny wins); remove refuses
  an env-only entry (env read-only) and a removal that would leave zero live
  channels (that would lock out every slash incl. `/admin` and fail the next
  start). First user added while users+roles were empty → warning (STANDARD
  → BLOCKED for unlisted callers). Removing the channel you are in → warning.
- **Audit:** `SlashContext.recordAudit` (bridge: `appendAudit` on the shared
  DB with the HMAC key). Mutations: `started` (fail closed) then `ok` /
  `error`; guard refusals and handler-level non-admins: `denied`
  (best-effort). Surface `discord:admin`, actor = invoker id, args digest
  only.
- **Gateway:** `flattenSlashOptions` flattens SUB_COMMAND_GROUP and
  SUB_COMMAND options; `SlashInteraction.subcommandGroup` added.
- No schema change, no new env var, no second store.

## From the change's testing.md

# Testing

- `tests/discord.admin-slash.test.ts` (fixtures: temp allowlist files,
  in-memory SQLite audit chain, no token or network):
  - body shape (groups, pickers) and nine command names;
    `flattenSlashOptions` for groups, subcommands and top-level options;
  - non-owner refused at dispatch, no owner ⇒ nobody, handler re-check when
    called directly (audited `denied`), muted / deny-listed owner refused,
    deny tip names `/admin channels add`;
  - users add: only the users line changes (comments, `[github]`, `[owner]`
    verbatim), live array spliced in place, first-user warning, audit
    `started` + `ok` with digest only and a valid chain, reload and owner
    load after the write; no-op second add; no warning when roles gate;
    deny-listed refused; invalid id → usage; env-sourced user noted; audit
    unavailable ⇒ fail closed;
  - channels add is live (the new channel passes the slash gate), deny-listed
    refused, remove drops it (warns when run in that channel), last channel
    refused, removal that would leave only deny-listed channels refused (the
    owner can still reach /admin; removing the denied one is allowed),
    env-only refused, file+env removes from the file only, unknown → no-op;
  - config show: counts by source, owner display without id, updatable
    knobs, no token / HMAC key in output; unknown route;
  - writer: missing file created 0600, path resolution order, atomic write
    keeps mode / follows symlink / leaves no temp file, TOML multi-line /
    missing key / missing section / CRLF / other-section key, JSON keeps
    owner and refuses lossy numbers and bad JSON, env never written to file.
- Updated: `tests/discord.register-commands.test.ts` (REQ-discord-016: guild
  PUT of nine bodies incl. `/announce` and `/admin`),
  `tests/discord.announce.test.ts`, `tests/discord.session-worktree.test.ts`
  (nine commands).
- `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-043 | `tests/discord.admin-slash.test.ts` |
| REQ-discord-009 | `tests/discord.register-commands.test.ts`, `tests/discord.admin-slash.test.ts` (body shape), `tests/discord.session-worktree.test.ts`, `tests/discord.announce.test.ts` |
| REQ-discord-016 | `tests/discord.register-commands.test.ts` (guild PUT of nine bodies then clear globals) |

## Where these lessons go

- `specs/discord/context.md`
