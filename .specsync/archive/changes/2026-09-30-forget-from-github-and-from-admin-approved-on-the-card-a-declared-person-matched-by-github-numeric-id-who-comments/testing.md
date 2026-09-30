---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: testing
---

# Testing

Fixture tests only: a temp allowlist file (owner, declared people with
Discord ids, GitHub logins and ids) and data dir shared by the WATCH poller
(injected events, a recording echo ack client, a fake agent) and the bridge
(null gateway recording DMs and card edits); `onSlash` / `onComponent` as
Discord would call them; no token, no network.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-1016` / `REQ-discord-1016` | `tests/watch.forget-me.test.ts` ("a declared person's 'forget me' raises the owner's card …") | Tofu's `@corvid-agent forget me` (GitHub id 4242) runs no model, records one pending ask (`github:4242:tofu-dev`, `github:CorvidLabs/Corvidinho#7`), `memory-forget-request` `started` / `ok` as `github:tofu-dev`, one reply with the request id, nothing deleted; the bridge's card names `@tofu-dev (GitHub account id 4242) in CorvidLabs/Corvidinho#7` with no content; Approve deletes Tofu's two memories and two kept WATCH threads (by login and by `github-id:4242` only), keeps Kyn's, the project row and a stranger's thread, DMs nobody but the owner and marks the card "They will be told on their GitHub thread."; the next poll posts "was approved" on #7 once, no count, and marks it told. |
| `REQ-watch-1016` / `REQ-discord-1016` | `tests/watch.forget-me.test.ts` ("undeclared and unconfirmed senders get no card …") | A stranger gets "not on the owner's people list … no request was made"; Kyn (login declared, id 999 not) gets "can't confirm"; "don't forget me in the release notes", a quoted "forget me" and an assignment event are normal runs (4 started); a forget ask and Kyn's question on the same issue both count; only Tofu's ask is recorded; a run's kept thread lists `github:tofu-dev` and `github-id:4242`; Deny deletes nothing and the next poll posts "did not approve". |
| `REQ-watch-1016` | `tests/watch.forget-me.test.ts` ("a thread that refuses the outcome (locked or gone) does not hold up the others' outcomes …") | Tofu's and Mo's asks (GitHub ids 4242 / 5151) are denied in that order; a 429 on Tofu's outcome post stops the pass (Mo's is not posted either); with a fresh poller, a bare 403 (locked issue) on Tofu's thread still lets Mo's "did not approve" go out and be marked told, and Tofu's goes out once the thread takes the post. Fails on the PR's first head (the pass stopped at any failed post) and on main. |
| `REQ-plugins-1016` | `tests/watch.forget-me.test.ts` ("in a WATCH run the model's memory-forget-me …") | With the GitHub commenter env, `memory-forget-me` fails naming `says just "forget me"` and MEMORY-ACL-6.a; no ask is recorded. |
| `REQ-discord-1016` | `tests/discord.admin-forget.test.ts` ("registered under /admin people …"), `tests/discord.admin-slash.test.ts` (subcommand list) | `forget` is the last `/admin people` subcommand, one required string `person`, "owner only" in its description. |
| `REQ-discord-1016` | `tests/discord.admin-forget.test.ts` ("the same card as a person's own ask …") | The owner's `/admin people forget person:Tofu` replies with the request id and audit rows, records `admin:<owner>` → `person:tofu` pending, DMs the owner the card ("started by you with /admin people forget", no content) at once; a second run reuses the ask; Approve deletes Tofu's three rows and turn but never the owner's note or turn, DMs nobody else, adds no "told" line, marks it told, leaves the people file; audit `admin-people-forget` started/ok ×2, `memory-forget-card`, `memory-forget-approve` started/ok, all as the owner. |
| `REQ-discord-1016` | `tests/discord.admin-forget.test.ts` ("refused: …", "called directly …") | An undeclared id and a Discord id are refused with `denied`; no person gives the usage; a non-owner through the bridge gets `not authorized` at the dispatch floor and, called directly, from the handler with a `denied` row; no DB ⇒ refused before any row; a keyed chain without the key ⇒ `audit log unavailable (SAFE-5)`; no ask, no card. |
| `REQ-discord-1016` | `tests/discord.admin-forget.test.ts` ("what an approved GitHub or /admin ask deletes") | `forgetTargets` for `github:4242:tofu-renamed` gives Discord ids `[Tofu]`, logins `tofu-dev` + `tofu-renamed`, ids `4242`; for `admin:<owner>` → Kyn only Kyn's id; a Discord ask unchanged. |
| `REQ-discord-101` / `REQ-discord-472` / `REQ-watch-472` | `tests/discord.forget-card.test.ts`, `tests/store.conversation.test.ts`, `tests/watch.conversation.test.ts`, `tests/memory.recall-github.test.ts` (unchanged) | The Discord ask, card, press, expiry, conversation delete and WATCH replay stay green. |

Fail on main: with main (20a0f58) checked out in a separate worktree and the
three test files copied in, all 10 new or changed tests fail on their
assertions (the files load: they use only APIs that exist on main) — the
GitHub "forget me" starts a run and records nothing, `memory-forget-me`
says "a Discord message or command", `/admin people forget` is an unknown
subcommand, `forgetTargets` takes `github:…` for a Discord id and has no
`githubIds`, the subcommand list lacks `forget` — and all pass on the
branch.
