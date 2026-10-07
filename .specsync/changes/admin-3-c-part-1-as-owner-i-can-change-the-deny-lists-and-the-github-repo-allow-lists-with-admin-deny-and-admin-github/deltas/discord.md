---
module: discord
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
---

# Delta: discord (/admin deny and /admin github — ADMIN-3.c part 1)

## Modified

### REQUIREMENT REQ-discord-043

The bridge SHALL register one owner-only `/admin` slash command with
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2),
`config show` (ADMIN-3) and `people list|add|link|unlink|remove` (ADMIN-3.a,
REQ-discord-036) plus `people role` (ADMIN-3.b, REQ-discord-065). The dispatcher SHALL require ADMIN and the handler
SHALL re-check ADMIN before doing anything else (ADMIN-4 / DISCORD-7); with
no owner nobody can run it (IDENTITY-2/3).

The `users` / `channels` mutations SHALL edit only `[discord].users` / `[discord].channels` in the
allowlist file the bridge already reads (the loaded file, else
`CORVIDINHO_ALLOWLIST_FILE`, else `~/.config/corvidinho/allowlist.toml`,
created 0600 when missing), written atomically (temp file in the same
directory, fsync, rename; mode kept) with every other line, section and
comment kept. The file SHALL be read and written as JSON exactly when the
allowlist loader reads it as JSON (one shared rule, `isJsonAllowlistPath`: a
case-sensitive `.json` suffix), else as TOML, so an edit always matches what
the next load reads. When that path is a symlink whose target does not
resolve (dangling or looping), the mutation, the atomic write and
`config show` SHALL refuse with a clear error, and the link SHALL NOT be
replaced by a regular file. The live allowlist SHALL be recomputed as file ∪
env and updated in place so it applies without a restart. Env values SHALL
NOT be written to the file or changed at runtime; the reply SHALL say so.

Empty SHALL stay deny-all: adding a deny-listed id SHALL be refused, and
removing an env-only channel SHALL be refused, as SHALL removing a channel
when no live channel that is not also on `deny_channels` would remain (deny
always wins, so only deny-listed channels left is the same lockout). When
the first user is added while users and roles were both empty, the reply
SHALL warn that unlisted callers now resolve to BLOCKED. Replies SHALL be
ephemeral, show before/after counts and never contain tokens or secrets.
`config show` SHALL list live/file/env counts, owner configured yes/no plus
display, the number of declared people (and of problems in their entries)
and of team and community roles among them, and which knobs are updatable
(declared people and their roles included). Each mutation SHALL append SAFE-5
audit rows (`started` before the write, then `ok`/`error`); refusals SHALL
append `denied`. A mutation SHALL fail closed with the same
`audit log unavailable (SAFE-5)` refusal, writing nothing, both when the
trail throws and when no trail is wired (a bridge without a DB); it SHALL
never write an unaudited change. The gateway SHALL flatten subcommand-group
options.

ADMIN-3.c (part 1 — the deny lists and the GitHub repo allow lists; mutes
are part 2): `/admin deny add|remove` SHALL take exactly one of `channel`
(STRING + autocomplete), `user` (USER), `role` (ROLE, option type 8),
`github_org`, `github_repo` or `github_user` and edit `[discord].deny_channels`
/ `deny_users` / `deny_roles` or `[github].deny_orgs` / `deny_repos` /
`deny_users`; `/admin github add|remove` SHALL take exactly one of `org` or
`repo` and edit `[github].orgs` / `repos` (the GitHub repo allow lists;
`[github].users` stays file / env and `config show` lists it read-only). No
option, or more than one, gets the usage reply; an entry that is not a
snowflake (channel, user, role), a GitHub login (org, user; a GitHub user may
also be a numeric id) or `OWNER/REPO` / `OWNER/*` (repo) is refused before the
file is read; neither writes or audits. Both SHALL go through the same
handler-time owner re-check, plan → `started` → commit → `ok` path, env-only
refusal on remove and fail-closed SAFE-5 trail as `users` / `channels`, with
actions `admin-deny-add|remove` and `admin-github-add|remove`. `/admin github
add` of an org or repo a deny list covers SHALL be refused (`denied`; deny
always wins). `/admin deny add` SHALL never lock the owner out: it refuses
(`denied`) the owner's Discord id (or the invoker's), a role the invoker holds
in this server or the server id (`@everyone`), a channel when no live
allowlisted channel would be left undenied, and the owner's GitHub login or
numeric id (`[owner]` or the owner's declared person). The allowlist writer
SHALL edit every list key the loader reads — `[discord]` users, channels,
deny_channels, deny_users, deny_roles and `[github]` orgs, repos, deny_orgs,
deny_repos, deny_users — writing the spelling the loader reads for aliases
(the canonical key when the file has it, else the alias the loader would read,
such as `organizations`, `repositories` or `denyUsers`, else the canonical
key). The TOML re-read guard stays as it is (every other key of every section
unchanged, `[owner]` and `[corvidinho.plugins]` included); the JSON guard
SHALL compare every key of the document other than the target key. The live
list SHALL be spliced in place. `config show` SHALL list each allow and deny
list with its live, file and env counts and up to ten entries (fewer when the
reply would pass 2000 characters), `[github].users` read-only, and name
`/admin deny add|remove` and `/admin github add|remove` among the updatable
knobs. No new env var, config key, schema or protocol change.

Acceptance Criteria
- Non-owner and no-owner callers get ephemeral `not authorized` at dispatch and at the handler; the file is not written.
- `/admin users add` writes only the users line, keeps `[owner]`/`[github]`/comments, updates the live list in place, and warns on the first user.
- `/admin channels add` makes a new channel pass the slash gate without restart; `remove` drops it; env-only and last-channel removals are refused, and so is a removal that would leave only deny-listed channels.
- Deny-listed ids are refused; unreadable/unparsable files are refused untouched; JSON with lossy numeric ids is refused.
- `/admin config show` shows counts by source and updatable knobs, and no token, key or owner id.
- Mutations append `started` + `ok` audit rows with an args digest only; an unavailable audit trail refuses the change.
- With no audit trail wired (`recordAudit` unset), `users add` and `channels add` reply `audit log unavailable (SAFE-5)`, and the file and live lists are unchanged; `config show` still works.
- `allowlist.JSON` (TOML text) is edited as TOML, matching the loader, and reloads with the new entry; `allowlistFileFormat` agrees with `isJsonAllowlistPath` for every path.
- A dangling or looping symlink at the allowlist path is refused by `/admin`, `writeFileAtomic` and `config show`; the link stays a symlink and its target is not created.
- Fixture tests only; no live Discord token or network.
- `/admin config show` shows the declared-people count with the problem count and names `/admin people add|link|unlink|remove` among the updatable knobs.
- The `/admin` body has the groups `users`, `channels`, `config` and `people` (`list`, `add`, `link`, `unlink`, `remove`, `role`), plus `deny` and `github` (ADMIN-3.c), still nine top-level commands; `role` takes `person` and `role` with the choices `team` / `community`.
- `/admin config show` counts team and community roles among the declared people and names `/admin people role` among the updatable knobs.
- `/admin deny add|remove` edits `[discord].deny_channels|deny_users|deny_roles` and `[github].deny_orgs|deny_repos|deny_users`, and `/admin github add|remove` edits `[github].orgs|repos`, in the file and the live lists in place; the gates refuse a newly denied channel, user, role or repo at once; rows `admin-deny-*` / `admin-github-*` are `started` then `ok` (`tests/discord.admin-lists.test.ts`).
- No option or two options get the usage reply, an invalid entry is refused, and neither writes or audits; an env-only entry cannot be removed; an org or repo a deny list covers cannot be allowed.
- `/admin deny add` refuses (`denied`) the owner's id, a role the owner holds here, `@everyone`, the last undenied channel and the owner's GitHub login or id; nothing is written.
- No trail (or one that throws) refuses `/admin deny` and `/admin github` with `audit log unavailable (SAFE-5)`; a non-owner is refused at dispatch and at the handler (`denied` row there).
- The writer covers the ten list keys, writes the alias the loader reads (`organizations`, `denyUsers`, JSON `Repositories` / `DenyRoles`), keeps `[corvidinho.plugins]` and every other key, and the JSON guard refuses a rewrite that changes any non-target key.
- `/admin config show` lists the entries of each list (Discord mentions, GitHub entries in code), `[github].users` read-only, stays under 2000 characters with many entries, and names `/admin deny` and `/admin github`.
