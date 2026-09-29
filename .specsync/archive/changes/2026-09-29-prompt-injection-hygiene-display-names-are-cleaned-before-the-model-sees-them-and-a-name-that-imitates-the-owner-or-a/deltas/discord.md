---
module: discord
change: prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a
---

# Delta — discord (untrusted text on Discord; SAFE-11/12/13)

## Added

### REQUIREMENT REQ-discord-071

Untrusted text on Discord (SAFE-11 / SAFE-12 / SAFE-13, #71). The IDENTITY-4
acting-user block SHALL show the acting user's Discord display name or
username only after `cleanDisplayName` (`cleanedDiscordName`; the declared
person's display and the owner map display are the owner's own and shown as
configured), and SHALL add one `name_clash` line when that shown Discord name
reads like the owner's display or another declared person's display or
nickname (`displayNameClash`, `namesLookAlike`); who the user is and their
role come only from the Discord user id (IDENTITY-7 / IDENTITY-12). Chat
messages, `/session start` and `/work` SHALL resolve the speaker's role
(`resolveDiscordActingRole`) before the run. For team and community speakers
(never the owner) `inboundInjection` SHALL scan the speaker's own words; a hit
SHALL start no run: on chat one public reply to the message
(`formatInjectionRefusal`: what it won't do and why in plain words, never the
text, pinging the owner with allowed mentions limited to the owner; without an
owner it says nobody could be told and logs `INJECTION_NO_OWNER_WARNING`), a
session the message started is ended and the turn is not recorded; on slash
(`refuseInjectedSlash`) the interaction gets the public refusal and the owner a
fresh channel post that pings only them, and no session, worktree or work task
is created; either way one `injection-suspected` / `denied` SAFE-5 row is
appended through the bridge's trail (actor, surface `discord:<session>` or
`discord:/<command>`, digest of the source and reason ids; best effort).
Otherwise a team / community speaker's words SHALL reach the model through
`fenceSpeakerText` (the `UNTRUSTED_DATA` fence with a header naming their role
and saying it is their request but data, not instructions); the owner's words
are unchanged. The spawn client SHALL read the child's `result.injection`
with `injectionNoticeFromUnknown` into `AgentSpawnResult.injection`, and the
post that carries a run's answer SHALL then ping the owner with
`formatInjectionOwnerLine`: chat and button-pick replies (`withInjectionNotice`,
with the SAFE-8 warning), `/session start` and `/work` (`slashOwnerNotice`
`injection`) and a schedule run's result post or ask post. Replayed session
turns SHALL strip invisible characters and mark a line that imitates a
Corvidinho block or a turn label (`Human:`, `You (Corvidinho):`) `(quoted)`,
so an earlier message cannot close the replay block or pass for a turn of
Corvidinho's own; recalled
memory lines SHALL strip invisible characters. `discord-user-lookup` names are
cleaned (REQ-plugins-071). No env var, config key, table or column.

Acceptance Criteria
- Through `startBridge` with a memory DB: a stranger's injection starts no run, gets one reply to the message that pings only the owner, ends the session it started and appends one `injection-suspected` / `denied` row with the stranger as actor; a declared team member's injection is refused too; the owner's own words run unfenced.
- An ordinary stranger message runs with the words inside the fence (`role: community`, `source=chat-message`), the display name cleaned and a `name_clash` line; a run reporting `injection` gets the owner line and the owner in its allowed mentions.
- `/session start` and `/work`: a stranger's injection creates no session and runs nothing, the interaction gets the refusal, the owner a fresh ping post, the trail one `denied` row; an ordinary stranger request runs fenced and the owner's unfenced.
- `slashOwnerNotice` and `withInjectionNotice` carry the SAFE-13 owner line and the owner mention; no notice leaves a post unchanged.
- The replay block marks a turn line that imitates its footer or a turn label `(quoted)` and still ends with its own footer.
- A schedule run reporting `injection` pings the owner with the SAFE-13 line on its result post and, when it ends with an ask, on its ask post.
- A non-owner's free-text answer to a pending ask reaches the model inside the fence (`tests/discord.slash-pending-ask.test.ts`).
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.

## Modified

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
unchanged. The one exception is SAFE-11 (REQ-discord-071): the
Discord display name / username shown is cleaned first (`cleanDisplayName`),
and a non-owner whose shown Discord name reads like the owner's display or
another declared person's display or nickname gets one `name_clash` line
saying this Discord user id is someone else; recognition and roles stay on
stable ids.

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
- SAFE-11 (REQ-discord-071): a stranger named `[owner] L<zero-width>eif` is shown as `display_name: Leif` with a `name_clash` line naming the owner and no owner facts; a stranger named like a declared person gets a `name_clash` line naming that person; the owner and a declared person shown by their own declared display get none; with nobody declared a clean, non-clashing name leaves the block byte-identical to before (`tests/safe.injection.test.ts`, `tests/identity.recognise.test.ts`).

