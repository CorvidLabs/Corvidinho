# Lesson bundle — declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Declared people: the owner declares who's who in the allowlist file, Corvidinho recognises the owner and each declared person on Discord and GitHub by stable ids only, and only the owner changes people and links with audited /admin people (IDENTITY-13/14/6/7, ADMIN-3.a, #36)
- **Kind**: Feature
- **Specs**: discord, watch
- **Paths**: src/identity/people.ts, src/discord/admin-people.ts, src/discord/admin-allowlist.ts, src/discord/bridge.ts, src/discord/command-handlers/admin.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/identity-inject.ts, src/discord/slash-commands.ts, src/watch/poller.ts, src/watch/router.ts, src/watch/searcher.ts, src/watch/types.ts, tests/discord.admin-people.test.ts, tests/identity.people.test.ts, tests/identity.recognise.test.ts, tests/discord.admin-slash.test.ts, docs/discord.md, docs/WATCH.md, docs/DISCORD-GO-LIVE.md, allowlist.example.toml, STATUS.md
- **Acceptance**: The owner declares people as [people.<id>] entries (display, nicknames, discord_ids, github_logins, github_ids) in the allowlist file the process loaded and that list is who's who (IDENTITY-13); a declared person and the owner are recognised on Discord (chat, button picks, /session start, /work identity block) and on GitHub (WATCH prompt block) by Discord user id, GitHub numeric id or GitHub login only, never by a display name or nickname, and an id linked to two people matches nobody (IDENTITY-14, IDENTITY-7); only the owner adds, changes or removes people and links, by editing the file or with owner-only /admin people add|link|unlink|remove that re-checks ADMIN at handler time and appends SAFE-5 audit rows before writing (fail closed without a trail), and no chat or plugin path writes people (IDENTITY-6, ADMIN-3.a); changes apply on the next message or WATCH event without a restart; tests/identity.people.test.ts, tests/discord.admin-people.test.ts and tests/identity.recognise.test.ts cover each and fail on the base sources

## Evidence

- Verification commit: `89a19b1217f1c36498dc140005bbf6ed896b0379`
- Base commit: `e54ec96dbd98ee6f6f85b80d81f9780cbf5fd889`
- Verified by: `specsync check --spec cli --spec discord --spec watch`

## From the change's context.md

# Context

Issue #36 (CONTACTS: declared people + Discord linker, milestone M1 "Knows
everyone"). Leif confirmed the criteria in the 2026-09-28 interview (round 6:
"capture all, renumbered"; round 10: ADMIN-3 knobs editable via /admin
include people). They were captured with `hi` in this PR's first commit
(`e54ec96`, on main `246cb6c`):

- **IDENTITY-13** "I declare each person's ids (nicknames, GitHub and Discord
  accounts), and that list is who's who." (draft IDENTITY-4 renumbered: the id
  was taken)
- **IDENTITY-14** "It recognises me and each declared person on Discord and
  GitHub." (draft IDENTITY-5 renumbered)
- **IDENTITY-6** "Only I add, change or remove a person's links, never through
  chat."
- **IDENTITY-7** "It matches people on stable ids, never on display names."
- **ADMIN-3.a** "As owner I can add, change and remove declared people and
  their links with /admin; every change is audited."

Gap on main: only the owner is known (`[owner]` / env, IDENTITY-1); every
other speaker is known by a Discord display name (IDENTITY-4 block) or a
GitHub login in the WATCH header, and nothing ties the two together.
`/admin` edits only `[discord].users` / `.channels`.

Constraints (settled): extend the existing owner / allowlist file rather than
a parallel store; owner admins; v1 off-chain (Discord + GitHub ids only, no
AlgoChat / wallet fields); no schema bump; #232 / #233 are landed separately
(this change only adds the `people` argument at the two identity-inject
call sites in `bridge.ts`). Later slices reuse the resolver: #65 roles
(`role` left optional), #101 profiles, #67 recall.

## From the change's design.md

# Design

- **Store (IDENTITY-13).** `[people.<id>]` sections in the allowlist file
  the process loaded (`AllowlistConfig.sourcePath`, the file `[owner]` is
  read from); a `people` object in a JSON file. Keys `display`,
  `nicknames`, `discord_ids`, `github_logins`, `github_ids` (singular
  spellings read). No new env var, config key, table, column or schema bump.
- **Reader + resolver** (`src/identity/people.ts`): quote-aware one-line
  TOML reader (like `parseOwnerToml`, since the shared list reader splits on
  commas) and a JSON reader; fail closed per entry. `buildPeopleDirectory`
  adds the owner (declared holder of the owner's Discord id, else built-in
  `owner`) and indexes Discord ids / GitHub logins / GitHub ids, dropping any
  id held by two people. `resolvePerson(dir, { discordId, githubLogin,
  githubId })` → `{ personId, displayName?, role?, person }` | null is the
  one resolver for #65 / #101 / #67; `role` is only `owner` today.
  `loadDeclaredPeople({ allowlist, owner })` re-reads the file on each call
  and never throws.
- **Discord (IDENTITY-14).** `IdentityInjectInput.people`; the bridge (chat
  + button-pick resume), `/session start` and `/work` pass
  `loadDeclaredPeople`. `resolveActingPerson` matches the acting Discord id
  only; the built-in owner entry is left to the existing owner lines.
- **GitHub (IDENTITY-14).** Search items / comments carry `user.id` →
  `DetectedEvent.senderId`; `startWatchPoller` loads the owner and passes
  `people` per event to `routeEvent`; `formatWatchIdentityBlock` builds a
  leading `[Corvidinho acting GitHub user …]` paragraph (Planning skips it).
- **Writer (ADMIN-3.a / IDENTITY-6)** (`src/discord/admin-people.ts`):
  `planPeopleChange` → SAFE-5 `started` → `commitPeopleChange`
  (`writeFileAtomic`) → `ok`, synchronous like `/admin users|channels`,
  reusing `resolveAdminAllowlistPath`, `danglingSymlinkError`,
  `parseJsonObject`, `scanSimpleToml`. A re-read safety net refuses any
  rewrite that would change lists, `[owner]`, another person or another
  section. After a write the live `allowlist.sourcePath` is set when it was
  null, so a bridge that started without a file reads the new one.
  `/admin people` routes live in `command-handlers/admin.ts`; the slash body
  adds a `people` group after `config`.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. People live in the allowlist file (`[people.<id>]`), not a separate
   people file; `owner` is a reserved person id.
2. `/admin people add` also changes the display name (the "change" of
   ADMIN-3.a); `link` / `unlink` take `discord` / `github` / `github_id`
   / `nickname`; no autocomplete for person ids.
3. Recognition covers the speaker (Discord acting user) and the commenter
   (WATCH) only; people merely mentioned, GitHub tool results and
   `discord-user-lookup` results are not annotated yet.
4. Once anyone is declared, an undeclared speaker is marked
   `declared_person: none`; with nobody declared prompts are byte-identical.
5. The declared display name wins over `[owner]` display and Discord names.
6. Nicknames are shown to the model but never matched (not stable ids).
7. GitHub logins count as stable ids, but a known numeric id that differs from
   the declared ones overrides the login.
8. An id linked to two people matches nobody; `/admin people link` refuses
   it, including the owner's `[owner]` GitHub login on someone else.
9. The owner's `[owner]` / env links are not editable through `/admin
   people` (edit on the VM); linking the owner's Discord id to a person makes
   it the owner's person.
10. A WATCH process that started without an allowlist file needs a restart
    to see a file created later (the bridge picks it up via `/admin people`).
11. No-change requests are not audited (as `/admin users|channels`).

## From the change's testing.md

# Testing

Fixture tests only: temp allowlist files, in-memory SQLite, `startBridge`
with a null gateway and dry-run, `startWatchPoller` with injected events; no
live Discord or GitHub, no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-036` | `tests/identity.people.test.ts` | TOML `[people.<id>]` with plural and singular keys (`#` and `'…'` in values) and the JSON `people` object parse to the expected people; the loader and `loadOwnerConfig` read the same file unchanged. Unreadable entries (bad snowflake, multi-line list, duplicate section, JSON number Discord id) are skipped whole; `owner` and a dotted id are refused; unread keys reported; no problem text holds an account id. `resolvePerson` by Discord id, `<@id>`, login (`@TOFU-dev`), numeric id (number and string); display names / nicknames resolve nobody; a login with another known numeric id resolves nobody; two people's ids, or an id declared twice, resolve nobody. The owner resolves as built-in (`role: owner`, by Discord id and `[owner]` login) or as the declared holder of the owner's Discord id; no owner ⇒ none. `loadDeclaredPeople` re-reads the loaded file per call; no file loaded ⇒ only the owner; an unreadable path ⇒ nobody, never a throw. |
| `REQ-discord-036` | `tests/discord.admin-people.test.ts` | Through `handleSlashInteraction`: add → link (discord, github, github_id, nickname) → unlink → display change → remove; after each change `resolvePerson` on the live file sees it; the file ends byte-identical to the start; audit rows `admin-people-<op>` `started`/`ok`, surface `discord:admin`. A hand-written person keeps its header comment, comments and unread key; removing it keeps the next section's comment, `[owner]` and lists. No-change requests write and audit nothing. A new file is created and chat reads it at once (`sourcePath` set); the loader reads it after a restart. JSON: only that entry changes, unread keys kept. Refused (file unchanged, `denied` rows): an id linked to another person, the owner's `[owner]` GitHub login on someone else, bad / reserved ids, undeclared person, bad link values, missing options, an unreadable entry; no audit trail or a throwing trail ⇒ `audit log unavailable (SAFE-5)`, no temp files left. Non-owner refused at dispatch and handler (`denied` row), `list` too. Only `src/discord/command-handlers/admin.ts` imports `admin-people` under `src/` and `plugins/`. `list` shows people, owner and problems, under 2000 chars with 80 people; `config show` shows the count. Writers: escaping and multi-line arrays elsewhere round-trip. |
| `REQ-discord-036` / `REQ-discord-446` | `tests/identity.recognise.test.ts` (Discord) | The block names `declared_person`, the declared display over the Discord name, nicknames, `github`; a stranger with a declared display name gets `declared_person: none`; the undeclared owner keeps display + role and no `none` line; a declared owner is named and still `role: owner (ADMIN)`; with nobody declared the block equals the no-people block. Through `startBridge`: a declared chat speaker is named; `/admin people add` + `link` and a VM edit change the next message's identity without a restart; a chat request to change links changes nothing; `/session start` and `/work` name the declared invoker. |
| `REQ-watch-036` | `tests/identity.recognise.test.ts` (WATCH) | `routeEvent` with `people`: the prompt starts with the identity paragraph then `[WATCH issue_comment] …`, and `planningSelectionText` drops it; renamed login by numeric id resolves, reused login with another id does not; owner by `[owner]` login with `role: owner`; a login equal to a display name is not that person; nobody declared / no `people` ⇒ prompt starts with `[WATCH`. The fixture searcher carries `user_id` to `senderId`. `startWatchPoller` with an allowlist file recognises a declared commenter and a person added to the file after start on the next event. |
| `REQ-discord-043` | `tests/discord.admin-slash.test.ts` | Body shape: groups `users`, `channels`, `config`, `people` (`list add link unlink remove`); nine commands. All other ADMIN-1..4 tests pass unchanged. |

Fail on base: with the base sources swapped in (main 246cb6c + the `hi`
capture; `src/identity/people.ts` and `src/discord/admin-people.ts`
absent), the three new files fail to load and the `/admin` body test fails
(4 fail, 29 pass). With only `src/identity/people.ts` restored, a copy of the
bridge and poller tests (no new exports imported) fails all 3 on
`declared_person: tofu` missing from the chat, slash and WATCH prompts. All
pass on the branch (66 across the five files).

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync
check --require-coverage 100` 100%; `hi check` green; `fledge lanes run
verify --non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
