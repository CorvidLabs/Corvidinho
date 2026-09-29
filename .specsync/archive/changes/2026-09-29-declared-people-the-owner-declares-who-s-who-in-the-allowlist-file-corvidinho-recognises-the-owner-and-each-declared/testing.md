---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: testing
---

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
