---
module: discord
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
---

# Delta — discord (forget from GitHub and from /admin, approved on the same card)

## Added

### REQUIREMENT REQ-discord-1016

Forget from GitHub and from /admin, approved on the card (MEMORY-ACL-6.a,
#101). A forget request SHALL record who asked in `requester_user_id` with no
schema change (`ForgetRequester`, `src/memory/forget.ts`): a Discord user id
(the person themself on Discord, as before), `github:<numeric id>:<login>`
(the person themself on GitHub, REQ-watch-1016) or `admin:<owner Discord id>`
(the owner with `/admin people forget`); a GitHub ask's thread SHALL be
`github:<owner/repo>#<n>` in `origin_channel_id` (`githubOriginOf`), and
`ForgetRequest.requester` SHALL be the parsed asker.

`/admin people forget person:<id>` SHALL be owner-only (dispatch floor and
the handler-time ADMIN re-check; a non-owner reaching the handler gets
`not authorized` and a `denied` row) and SAFE-5 audited like the other
`/admin people` ops (`admin-people-forget`: `started` before the request,
`ok` after; no trail or a trail that throws ⇒ refused, nothing asked;
`error` when the request cannot be recorded). The id SHALL name a person
declared under `[people]` in the file the bridge loaded, re-read now
(`memorySubjectForPerson`; never a Discord id); anything else SHALL be
refused with a `denied` row and nothing asked. It SHALL record the same
`forget_requests` ask a person's own request does (`SlashContext.requestForget`,
one open ask per person: a pending one is reused and the reply says so),
reply ephemerally with the request id and audit row numbers, and then run a
delivery pass at once (`SlashContext.deliverForgetCards`) so the owner gets
the same DM Approve/Deny card. The bridge SHALL wire both to its DB and
forget cards; with no DB the command refuses.

The card SHALL say who asked and where: `asked by <@id> in <#channel>` for a
Discord ask, `asked on GitHub by @login (GitHub account id N) in
owner/repo#n` for a GitHub ask, `started by you with /admin people forget`
for the owner's. Audit rows of a pass (card, expiry) SHALL name the asker as
the Discord id, `github:<login>` or the owner's id. The bridge SHALL never DM
or post to a GitHub asker: their outcome is left to the WATCH poller
(`ForgetRequestStore.unnotifiedGithub`), and the card, once decided, SHALL
say they will be told on their GitHub thread. An ask the owner started SHALL
be marked told when decided, with no DM or post to anyone and no "told" line
on the card.

What an approved ask deletes (`forgetTargets`) SHALL add the asker's Discord
id only for a Discord ask (never an `admin:` or `github:` asker, so the
owner who started a forget is never a target), and SHALL cover a declared
person's GitHub logins and numeric ids as linked now plus the login and
numeric id a GitHub ask came from (`githubLogins`, `githubIds`);
`forgetMemoryTargets` / `forgetConversations` /
`ConversationStore.deleteForPerson` SHALL delete kept conversations whose
participants hold `github-id:<n>` (`githubIdParticipant`) for those ids, as
well as by login. Nothing is deleted before the owner's Approve.

Acceptance Criteria
- `/admin people forget` is registered under `/admin people` with a required `person` string.
- The owner's `/admin people forget person:Tofu` writes `admin-people-forget` `started` / `ok`, one pending ask (subject `person:tofu`, requester `admin:<owner id>`), replies with the request id, and DMs the owner a card saying "started by you with /admin people forget" (no memory content); a second run reuses the open ask; nothing is deleted before Approve.
- Approve deletes that person's memory rows and session turns, never the owner's own memory or turns; nobody else is DMed; the ask is marked told; the people file is unchanged.
- An undeclared id or a Discord id is refused with `denied`, no person gives the usage, a non-owner gets `not authorized`, a keyed chain without the key refuses (`audit log unavailable (SAFE-5)`) — no ask, no card.
- A GitHub ask's card names `@login (GitHub account id N) in owner/repo#n`; the bridge never DMs its asker and marks the card "They will be told on their GitHub thread."; Approve also deletes kept WATCH conversations by the ask's login and by `github-id:<n>`.
- `forgetTargets` for a GitHub ask gives the declared Discord ids only, the declared and asking logins and the numeric id; for an `/admin` ask the person's Discord ids only; a Discord ask is unchanged.
- `tests/discord.admin-forget.test.ts`, `tests/watch.forget-me.test.ts` and `tests/discord.admin-slash.test.ts` cover each and fail on main.
