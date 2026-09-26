---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: design
---

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
