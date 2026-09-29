---
module: watch
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
---

# Delta — watch (the commenter is recognised as a declared person)

## Added

### REQUIREMENT REQ-watch-036

WATCH SHALL recognise the owner and each declared person (IDENTITY-14,
REQ-discord-036) who triggers an event, by stable ids only (IDENTITY-7): the
commenter's GitHub numeric id (`DetectedEvent.senderId`, from the API's
`user.id` on search items and comments; the fixture search client reads
`user_id`) and login, through `resolvePerson`. `startWatchPoller` SHALL load
the owner (IDENTITY-1) from the allowlist file it loaded plus env, and pass
the declared people, re-read from that file for every routed event, to
`routeEvent` (`RouterDeps.people`), so edits apply without a restart. For a
resolved commenter the run prompt SHALL open with a separate paragraph headed
`[Corvidinho acting GitHub user …]` naming `github_login`, `declared_person`,
`display_name`, `nicknames` and, for the owner, `role: owner` (a GitHub run
still gets no ADMIN tools), before the `[WATCH …]` header; Planning ignores
that paragraph like the Discord identity block. Once anyone is declared, an
unresolved commenter SHALL get the block with `declared_person: none`; with
nobody declared (only the owner) and an unresolved commenter, or without
`people`, the prompt SHALL be exactly as before. Allowlist gates, sessions,
acks and the spawn env (no Discord actor, non-ADMIN) are unchanged.

Acceptance Criteria
- A declared commenter's start prompt begins with the identity paragraph (`github_login`, `declared_person`, `display_name`, `nicknames`), then a blank line and `[WATCH issue_comment] …`; `planningSelectionText` drops it.
- A renamed login with the declared numeric id resolves; the declared login with a different numeric id does not (`declared_person: none`).
- The owner is recognised by the `[owner]` / env GitHub login with `role: owner`; a commenter whose login equals a declared display name is not that person.
- With nobody declared, or without `people`, an unresolved commenter's prompt starts with `[WATCH`.
- The fixture search client carries `user_id` to `senderId` on comment events.
- `startWatchPoller` with an allowlist file recognises a declared commenter, and a person added to the file after start is recognised on the next event.
- Regression tests in `tests/identity.recognise.test.ts` fail on the base sources and pass after.
