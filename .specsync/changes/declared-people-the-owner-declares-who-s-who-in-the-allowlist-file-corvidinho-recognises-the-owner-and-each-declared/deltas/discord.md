---
module: discord
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
---

# Delta — discord (declared people, recognised by stable ids, changed only by the owner's /admin people)

## Added

### REQUIREMENT REQ-discord-036

Declared people (IDENTITY-13, #36). The owner SHALL declare who's who as
`[people.<id>]` sections of the allowlist file (a `people` object in a JSON
file) with `display`, `nicknames`, `discord_ids`, `github_logins` and
`github_ids` (singular spellings read too; one-line values). The person id
SHALL be 1–32 lowercase letters, digits, `-` or `_`; `owner` is reserved.
People SHALL be read from the allowlist file this process loaded (the file
`[owner]` comes from, `AllowlistConfig.sourcePath`), re-read on every use, so
a VM edit or an `/admin people` change applies on the next message, slash run
or WATCH event without a restart; no file loaded means nobody declared. There
SHALL be no second store, env var, config key, table or column, and the
allowlist loader and `[owner]` reader SHALL read a file with people sections
exactly as before.

Fail closed: an entry with any unreadable value (bad Discord snowflake,
GitHub login or numeric id, a list spanning lines, a JSON number for a
Discord id, a duplicate section) SHALL be skipped whole and reported as a
plain-language problem naming the person id and key, never an account id.

`resolvePerson(directory, { discordId, githubLogin, githubId })` SHALL be the
one resolver (for later slices too) and SHALL return `{ personId,
displayName?, role?, person }` or null. It SHALL match only on stable ids —
the Discord user id (or `<@id>`), the GitHub numeric id and the
case-insensitive GitHub login — and never on a display name or nickname
(IDENTITY-7). A login SHALL NOT match when the GitHub numeric id is known and
the person declared other GitHub ids; ids that point at two different people,
and an id declared for two people, SHALL match nobody. The configured owner
(IDENTITY-1) SHALL always be a person: the declared entry holding the owner's
Discord id (the owner's GitHub login added to it), else a built-in `owner`
entry from `[owner]` / env; its `role` SHALL be `owner`. No other role is read
yet (#65 adds roles). No AlgoChat or wallet ids.

Recognised on Discord (IDENTITY-14): every interactive run (chat message,
ask button pick resume, `/session start`, `/work`) SHALL add to the
IDENTITY-4 acting-user block, for a declared acting user,
`declared_person: <id>`, the declared `display_name` (winning over the
Discord names), `nicknames` and `github` logins, matched on the acting
Discord user id only. Once anyone is declared, an undeclared non-owner SHALL
be marked `declared_person: none`, so a Discord display name never passes for
a declared person. An owner who is not declared under `[people]` keeps the
block exactly as before, and with nobody declared the block SHALL be
unchanged.

Only the owner changes people (IDENTITY-6, ADMIN-3.a): `/admin people
list|add|link|unlink|remove` (owner-only; dispatcher floor ADMIN plus a
handler re-check) SHALL be the only writer besides editing the file on the
VM; no plugin, chat path or model tool SHALL write people. `add` declares a
person or changes their display name; `link` / `unlink` add or remove one or
more of `discord` (user picker), `github`, `github_id` and `nickname`;
`remove` drops the person and all links; `list` shows the effective people
(owner marked) and any problems, under Discord's 2000-character cap. A
`link` that would put a stable id on a second person (the built-in owner
included) SHALL be refused; an unreadable entry SHALL NOT be edited. TOML
writes SHALL rewrite only that person's read keys (header, comments and
unread keys kept, every other line verbatim), append a new section, or drop a
removed one; JSON writes SHALL change only that person's entry. The rewrite
SHALL be atomic (`writeFileAtomic`) and SHALL be re-read before writing: allow
and deny lists, `[owner]`, every other person and every other section
unchanged, and the person reading back as planned, else refused with nothing
written. Each change SHALL append SAFE-5 audit rows `admin-people-<op>`
(surface `discord:admin`, actor = invoker, args digest only): `started` before
the write, then `ok` / `error`; refusals and a non-owner caught by the handler
append `denied`; no trail wired or a trail that throws SHALL refuse with
`audit log unavailable (SAFE-5)` and write nothing. A bridge that started
without a file SHALL read the file its first `/admin people` change writes.

Acceptance Criteria
- `[people.<id>]` TOML (plural and singular keys) and the JSON `people` object parse to people; the allowlist loader and `[owner]` reader load the same file unchanged.
- Unreadable entries are skipped whole with problems that name the person and key but no account id; `owner` is a reserved id.
- `resolvePerson` resolves by Discord id, `<@id>`, GitHub login (any case, `@`) and GitHub numeric id (number or string); display names and nicknames resolve nobody; a login with a different known numeric id resolves nobody; ids of two different people, and an id declared twice, resolve nobody.
- The owner resolves with `role: owner` as the built-in entry (by Discord id and `[owner]` GitHub login) or as the declared person holding the owner's Discord id; no owner configured ⇒ no owner person.
- People are re-read per call from the loaded file; a missing / unreadable file reads as nobody declared, never a throw.
- A declared chat speaker's prompt names `declared_person`, the declared display (not the Discord one), nicknames and GitHub logins; a stranger with a declared person's display name gets `declared_person: none`; the undeclared owner's and everyone's block with nobody declared are byte-identical to before.
- Through `startBridge`: an `/admin people add` + `link` by the owner and a VM edit of the file change who the next chat message is recognised as, without a restart; a chat message asking to change links changes nothing.
- `/admin people add|link|unlink|remove` edit the file as described, keep every other line verbatim, and each change appends `started` + `ok` rows; no-change requests append nothing.
- Refused: an id linked to another person (including the owner's `[owner]` GitHub login), bad person ids, `owner`, an undeclared person for `link`, invalid link values, an unreadable entry; no audit trail or a throwing trail; the file is unchanged.
- A non-owner is refused at dispatch and at the handler (`denied` row); `list` is owner-only too.
- Only `src/discord/command-handlers/admin.ts` imports the people writer; nothing under `src/` or `plugins/` else does.
- Regression tests `tests/identity.people.test.ts`, `tests/discord.admin-people.test.ts` and `tests/identity.recognise.test.ts` fail on the base sources and pass after.

## Modified

### REQUIREMENT REQ-discord-043

The bridge SHALL register one owner-only `/admin` slash command with
subcommand groups `users add` (ADMIN-1), `channels add|remove` (ADMIN-2),
`config show` (ADMIN-3) and `people list|add|link|unlink|remove` (ADMIN-3.a,
REQ-discord-036). The dispatcher SHALL require ADMIN and the handler
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
display, the number of declared people (and of problems in their entries),
and which knobs are updatable (declared people included). Each mutation SHALL append SAFE-5
audit rows (`started` before the write, then `ok`/`error`); refusals SHALL
append `denied`. A mutation SHALL fail closed with the same
`audit log unavailable (SAFE-5)` refusal, writing nothing, both when the
trail throws and when no trail is wired (a bridge without a DB); it SHALL
never write an unaudited change. The gateway SHALL flatten subcommand-group
options.

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
- The `/admin` body has the groups `users`, `channels`, `config` and `people` (`list`, `add`, `link`, `unlink`, `remove`), still nine top-level commands.

### REQUIREMENT REQ-discord-446

Every interactive Discord agent run (an @mention / reply / thread chat
message, an ask button pick resume, `/session start` and `/work`) SHALL
prepend the IDENTITY-4 acting-user block to the spawn prompt: the acting
user's Discord id and, when one is known, a display name. The display name SHALL be the
declared person's display when the acting user is a declared person with one
(REQ-discord-036), else the
configured owner's display when the acting user is the owner and it is set,
else the Discord display name on that message or interaction, else its
Discord username; when none is known the block SHALL carry the id only and
SHALL NOT invent a name (IDENTITY-4). An ask button pick resume SHALL take
the names from the press itself: the live gateway SHALL set
`ComponentInteraction.userDisplayName` (guild member display, then member
nickname, then user global name, then user display) and
`ComponentInteraction.userUsername`, trimmed, blank as absent, and the
bridge SHALL pass them to `enrichPromptWithIdentity` as the chat path passes
the message author's. The presser is the session's user (another user's
press never resumes), so the names describe the acting user. No new slash
command, env var, config key, table or column.

Acceptance Criteria
- A non-owner's button-pick resume prompt has `display_name` from the press's Discord display name, or from its username when there is no display name.
- The owner's button-pick resume keeps the owner map display and the `role: owner (ADMIN)` line; the Discord names do not replace the owner display.
- A button pick with no names known injects the Discord id only, with no `display_name` line.
- `componentActorNames` resolves member display → member nickname → user global name → user display for the display name and trims the username; blank or missing values are `undefined`.
- A discord.js button press through the live gateway's InteractionCreate listener reaches `onComponent` with the presser's `userDisplayName` and `userUsername`, and with neither when no name is known.
- The chat path, `/session start` and `/work` keep their identity inject unchanged.
- No new slash command, env var, config key, table or column; SQLite schema version unchanged.
- Regression tests in `tests/discord.identity-pick.test.ts` fail on `main` and pass after.
- A declared person's declared display name wins over the Discord display name and username on every interactive run; with nobody declared the block is exactly as before (REQ-discord-036).
