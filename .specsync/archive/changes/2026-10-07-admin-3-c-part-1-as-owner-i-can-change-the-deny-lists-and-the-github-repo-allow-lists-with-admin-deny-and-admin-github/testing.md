---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: testing
---

# Testing

`tests/discord.admin-lists.test.ts` (28 cases; temp allowlist files,
in-memory SQLite audit, the real `/admin` handler and slash dispatcher; no
token, no network): slash body; the writer for each of the ten list keys
(add + remove through the loader, one line changed, `[corvidinho.plugins]`
kept, live array spliced in place); TOML and JSON aliases; the re-read guard
(TOML every key of every section, JSON every non-target key); input
validation; `/admin deny` user / role / channel / GitHub org / repo / user;
exactly-one and validation refusals; lockouts; env-only removal; fail-closed
trail; owner-only at dispatch and handler; `/admin github` org / repo,
deny-wins refusals, last-entry warning; `config show` entries and the
2000-character cap.

`tests/watch.allowlist-reload.test.ts` (6 cases; real `startWatchPoller`,
dry run, injected events): an `/admin github add` and `/admin deny add` apply
on the next cycle with the config spliced in place; a numeric id on
`deny_users` refuses that sender by id (a renamed login included); a broken
file skips the cycle; an empty repo/org list polls nothing; a list change
forgets denied ids; IDENTITY-12.a roles after a reload.

`tests/discord.admin-slash.test.ts` (updated): the `/admin` body now has the
`deny` and `github` groups.

Fail-on-base: with origin/main 54d6a6c's
`src/discord/{admin-allowlist,command-handlers/admin,slash-commands}.ts`,
`src/identity/people.ts` and `src/watch/{config,poller}.ts` swapped in, all 33
new cases fail (28 + 5); restored, all pass. Review follow-up: with the
first-round `src/watch/router.ts` and `src/discord/command-handlers/admin.ts`
swapped in, the numeric-id WATCH case and the extended deny-wins case (an org
whose `OWNER/*` is on `deny_repos`) fail; restored, all pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-043` | `tests/discord.admin-lists.test.ts` (28), `tests/discord.admin-slash.test.ts` | deny / github add+remove write the loader's key and splice live; exactly-one + validation; deny-wins; lockouts `denied`; env-only refused; SAFE-5 `admin-deny-*` / `admin-github-*` started → ok, fail closed; non-owner refused; aliases + `[corvidinho.plugins]` kept; JSON guard; config show entries, `[github].users` read-only, ≤ 2000 chars; body groups. |
| `REQ-watch-043` | `tests/watch.allowlist-reload.test.ts` (6) | next-cycle apply with in-place splice; a numeric id on `deny_users` refuses the sender by id; unreadable file skips the cycle; empty list polls nothing; denied ids cleared on change; IDENTITY-12.a role after reload. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
