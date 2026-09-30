---
module: discord
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
---

# Delta — discord (GitHub people match by numeric user id only; [owner] github_id; /admin people link github stores the id)

## Added

### REQUIREMENT REQ-discord-367

GitHub matches people by numeric user id only (IDENTITY-7.a, #36; captured
from Leif's 2026-09-28 interview, round 12: "On GitHub it matches people only
by their numeric user id, so a renamed or re-registered login never counts as
them."). On GitHub a person — the configured owner included — SHALL be
recognised only by their GitHub numeric user id, never by a GitHub login.
`resolvePerson` (REQ-discord-036) SHALL match the GitHub side on `githubId`
alone (`PersonQuery.githubLogin` is accepted and ignored), and
`memorySubjectForGithub(dir, { login, id })` (REQ-discord-067) on `id` alone.
An actor with no numeric id, or an id nobody declared, SHALL resolve to
nobody — undeclared, so community at most (IDENTITY-12), never the owner —
whatever its login. GitHub logins (`github_logins`, `[owner] github_login`)
SHALL stay labels: read, written and shown as before (the Discord identity
block's `github` line, `/admin people list`), used to @mention the owner on
GitHub and to find a person's kept GitHub threads on forget-me, and still
refused on a second person by `/admin people link`, but never matched.

The owner's GitHub id SHALL be declared as `github_id` in the allowlist file's
`[owner]` section (TOML quoted or bare digits; JSON string or safe integer),
read into `OwnerRecord.githubId` and added to the owner's person (the declared
entry holding the owner's Discord id, else the built-in `owner` entry); an
invalid value — including `0`, since GitHub ids start at 1 — SHALL be ignored
with a value-free issue. There is no env var
for it; env still overrides the other owner fields. `isOwnerGithub(owner,
githubId)` SHALL be true only for that numeric id.

`/admin people link person:<id> github:<login>` SHALL, once the request plans
without a refusal, defer its ephemeral reply and look the login's numeric id
up once through the GitHub API (`createGithubUserLookup` in
`src/identity/github-user.ts`: `GET /users/{login}` with `GITHUB_TOKEN` /
`GH_TOKEN` when set, a 10 s timeout; `SlashContext.lookupGithubUser`
overrides it), then link that id as a `github_id` next to the login — also
when the login is already linked — so the id is stored in `github_ids`
(`github_ids` stays the stored field); owner-only and audited like every
`/admin people` change (REQ-discord-036). A lookup that fails, times out,
finds no user or answers for another login SHALL link nothing, append one
`admin-people-link` `error` row and reply why (the HTTP status only, never a
token or response body), suggesting `github_id:<number>`. A refused request
makes no GitHub call, and neither do `github_id:`, `discord:` or `nickname:`
links. `unlink github:<login>` removes the label only; when GitHub ids stay
linked the reply says they still match. The lookup module is not a writer of
people.

People entries with only `github_logins` SHALL keep loading (no issue, still
matched on Discord) but SHALL NOT match on GitHub until an id is linked;
`peopleWithoutGithubId(dir)` lists them, the owner's person included, by
person id for `corvidinho doctor` (REQ-cli-367). No schema, table or column
change; no package version bump.

Acceptance Criteria
- `resolvePerson` / `memorySubjectForGithub`: a GitHub login alone, or the owner's or a declared person's login with another numeric id, resolves nobody; the declared numeric id resolves the person whatever the login now is.
- `[owner] github_id` is read from TOML and JSON (string or number), joins the owner's person (built-in or declared) and is the owner on GitHub; an invalid one is ignored with a value-free issue; an env-only owner login is not the owner on GitHub; `isOwnerGithub` matches the numeric id only.
- A login-only people entry loads without an issue and still matches on Discord, but not on GitHub; with `github_ids` added it matches on GitHub under any login.
- `/admin people link github:<login>` writes the looked-up id to `github_ids` (login kept), audits `started` / `ok`, defers the reply first and resolves the id at once; linking again is no change; a failed, missing or mismatched lookup writes nothing and audits `error`; a refused request and `github_id:` links make no lookup; unlinking a login says the id still matches.
- `createGithubUserLookup` over a stubbed transport returns the numeric id and canonical login on 200, "no user" on 404, the status only otherwise (never the token), and refuses a payload without a numeric id.
- `tests/identity.github-numeric-id.test.ts` fails on the base sources and passes after; `tests/identity.people.test.ts`, `tests/identity.owner.test.ts`, `tests/discord.admin-people.test.ts` and `tests/memory.rank.test.ts` hold the numeric-id rule.

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
SHALL be no second store, env var, config key, table or column (the one later
key, the owner's `[owner] github_id`, is REQ-discord-367), and the
allowlist loader and `[owner]` reader SHALL read a file with people sections
exactly as before.

Fail closed: an entry with any unreadable value (bad Discord snowflake,
GitHub login or numeric id, a list spanning lines, a JSON number for a
Discord id, a duplicate section) SHALL be skipped whole and reported as a
plain-language problem naming the person id and key, never an account id.

`resolvePerson(directory, { discordId, githubLogin, githubId })` SHALL be the
one resolver (for later slices too) and SHALL return `{ personId,
displayName?, role?, person }` or null. It SHALL match only on stable ids —
the Discord user id (or `<@id>`) and the GitHub numeric id — and never on a
display name, nickname or GitHub login (IDENTITY-7; on GitHub the numeric id
only, IDENTITY-7.a, REQ-discord-367: `githubLogin` is accepted and ignored,
so a renamed or re-registered login never counts as anyone); ids that point
at two different people, and an id declared for two people, SHALL match
nobody. The configured owner (IDENTITY-1) SHALL always be a person: the
declared entry holding the owner's Discord id (the owner's `[owner]` GitHub
id and login added to it), else a built-in `owner` entry from `[owner]` /
env; its `role` SHALL be `owner`. No other role is read
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
- `resolvePerson` resolves by Discord id, `<@id>` and GitHub numeric id (number or string); GitHub logins (alone, or with another numeric id), display names and nicknames resolve nobody; ids of two different people, and an id declared twice, resolve nobody.
- The owner resolves with `role: owner` as the built-in entry (by Discord id and `[owner]` GitHub id, never the `[owner]` login) or as the declared person holding the owner's Discord id; no owner configured ⇒ no owner person.
- People are re-read per call from the loaded file; a missing / unreadable file reads as nobody declared, never a throw.
- A declared chat speaker's prompt names `declared_person`, the declared display (not the Discord one), nicknames and GitHub logins; a stranger with a declared person's display name gets `declared_person: none`; the undeclared owner's and everyone's block with nobody declared are byte-identical to before.
- Through `startBridge`: an `/admin people add` + `link` by the owner and a VM edit of the file change who the next chat message is recognised as, without a restart; a chat message asking to change links changes nothing.
- `/admin people add|link|unlink|remove` edit the file as described, keep every other line verbatim, and each change appends `started` + `ok` rows; no-change requests append nothing.
- Refused: an id linked to another person (including the owner's `[owner]` GitHub login), bad person ids, `owner`, an undeclared person for `link`, invalid link values, an unreadable entry; no audit trail or a throwing trail; the file is unchanged.
- A non-owner is refused at dispatch and at the handler (`denied` row); `list` is owner-only too.
- Only `src/discord/command-handlers/admin.ts` imports the people writer; nothing under `src/` or `plugins/` else does.
- Regression tests `tests/identity.people.test.ts`, `tests/discord.admin-people.test.ts` and `tests/identity.recognise.test.ts` fail on the base sources and pass after.
- SAFE-11 (REQ-discord-071): a stranger named `[owner] L<zero-width>eif` is shown as `display_name: Leif` with a `name_clash` line naming the owner and no owner facts; a stranger named like a declared person gets a `name_clash` line naming that person; the owner and a declared person shown by their own declared display get none; with nobody declared a clean, non-clashing name leaves the block byte-identical to before (`tests/safe.injection.test.ts`, `tests/identity.recognise.test.ts`).
- IDENTITY-7.a (REQ-discord-367): an entry with `github_logins` but no `github_ids` loads without an issue and still matches on Discord, but resolves nobody on GitHub until an id is linked (`tests/identity.github-numeric-id.test.ts`).

### REQUIREMENT REQ-discord-042

Corvidinho SHALL load a durable owner record from bot-VM config (IDENTITY-1,
ALLOW-4): a Discord user snowflake plus optional GitHub login and display
name, from env `CORVIDINHO_OWNER_DISCORD_ID`, `CORVIDINHO_OWNER_GITHUB_LOGIN`,
`CORVIDINHO_OWNER_DISPLAY` and/or an `[owner]` section (`discord_id`,
`github_login`, `display`) in the allowlist file, plus an optional GitHub
numeric user id from `[owner] github_id` (file only, REQ-discord-367). Env
SHALL override the file per field. The record is re-read on every start, so
it survives restarts. The owner SHALL be matched only by Discord snowflake
and, on GitHub, by the `[owner] github_id` numeric user id (IDENTITY-7.a) —
never by GitHub login or display name; the login is kept for @mentions.

ADMIN SHALL be owner-only (IDENTITY-2, Leif decision on #42). At handler time
(ADMIN-4 / DISCORD-7) `resolvePermissionLevel` SHALL return ADMIN only for
the owner's Discord id, and not when the owner is muted or on the Discord deny
list. `CORVIDINHO_DISCORD_ADMIN_USERS` / `_ROLES` SHALL NOT grant ADMIN. A
missing, blank, or non-snowflake owner id SHALL mean no owner, and with no
owner nobody is ADMIN (IDENTITY-3). When the legacy admin lists are set, or no
owner is configured, the bridge SHALL log a start-up warning that never echoes
ids.

Ephemeral `/status` and `corvidinho doctor` SHALL show whether an owner is
configured plus the display name only, never ids, logins, or tokens.

Acceptance Criteria
- Env and allowlist-file `[owner]` load the owner; env wins per field; reloading the same config yields the same owner.
- The owner matches by Discord snowflake or the `[owner] github_id` numeric id (`isOwnerGithub(owner, githubId)`); the GitHub login and the display name never match.
- The owner resolves to ADMIN; a muted or deny-listed owner does not.
- Admin user/role lists never resolve to ADMIN, with or without an owner; no owner ⇒ nobody ADMIN and admin slash (/mute) is refused for everyone.
- Bridge start warns when the legacy admin lists are set or no owner is configured.
- `/status` (ephemeral) and `corvidinho doctor` show owner configured yes/no plus the display name only.
- Fixture tests only; no live Discord token or network.

### REQUIREMENT REQ-discord-067

Ranked recall and a memory search for each message (MEMORY-9, #67), and the
GitHub memory subject (MEMORY-8). `MemoryStore.recall` with a `query` SHALL
be a search: its terms (`recallTerms`: lowercased letters/digits, words of
two or more characters, common question words and pronouns dropped, a light
English stem, at most 24) and the whole query are matched in keys and content
(case-insensitive), at most 500 newest candidates are read, a key read in two
scopes is kept once (newest), and rows are ranked (`rankMemories`) by
relevance — each term weighted by its inverse frequency among the
candidates, a key hit counting double, the whole query adding a bonus — times
a recency weight (30-day half-life, never below 3/4), newer first on ties.
A query with no terms SHALL match as one substring, newest first, as before.
Private notes stay out unless asked (MEMORY-7). No FTS table and no schema
change.

The chat and button-pick inject (REQ-discord-023 / REQ-discord-101) SHALL
search memory for the human's message (the picked label on a button):
`recallRelevantThenRecent` — the rows relevant to it first, then the newest to
fill, at most 20 — for the speaker's block and for the owner / team project
block; the owner's and team's `/work` project block (REQ-discord-101) SHALL
likewise be searched for the work description
(`enrichPromptWithProjectMemory(…, limit, query)`). Without a query the
blocks are the newest rows, as before.

`memorySubjectForGithub(dir, { login, id })` SHALL resolve a GitHub
commenter to their declared person's subject by the numeric `id` only (the
`login` is ignored, IDENTITY-7.a, REQ-discord-367; the same scopes as on
Discord; the configured owner not declared under `[people]`, recognised by
`[owner] github_id`, to their Discord-id subject; no id, undeclared or
ambiguous ⇒ null), and `projectScopeForRepo(repo)`
SHALL give `project:<owner/repo>` lowercased for a valid `owner/repo` (else
null). The Discord agent spawn SHALL always clear
`CORVIDINHO_ACTING_GITHUB_LOGIN` / `_ID` / `_REPO`, so a Discord or
scheduled run never acts for a GitHub commenter.

Acceptance Criteria
- A question in plain words finds the fact it is about; a key hit outranks a newer passing mention; equal relevance goes to the newer row; a question-words-only query matches as one substring.
- A multi-scope search keeps the newest of a key once and leaves private notes out.
- The Discord inject holds an older fact the message is about although newer rows fill the block; an owner's `/work` run holds an older project fact its description is about although newer rows fill the block.
- `memorySubjectForGithub` matches by numeric id only (a login alone, or with a numeric id that differs, is nobody) and maps the undeclared-under-`[people]` owner, by `[owner] github_id`, to their Discord id; `projectScopeForRepo` accepts only `owner/repo`.
- A Discord spawn clears inherited GitHub commenter keys.
- `tests/memory.recall-github.test.ts` and `tests/memory.rank.test.ts` cover each and fail on the stacked base sources.
