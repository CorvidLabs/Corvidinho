# Lesson bundle — forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101)
- **Kind**: Feature
- **Specs**: discord, watch, plugins
- **Paths**: hi/memory.md, src/memory/forget.ts, src/memory/index.ts, src/memory/scope.ts, src/store/conversation.ts, src/discord/forget-card.ts, src/discord/command-handlers/admin.ts, src/discord/slash-commands.ts, src/discord/slash-types.ts, src/discord/bridge.ts, src/watch/forget-me.ts, src/watch/poller.ts, plugins/memory/commands.ts, tests/watch.forget-me.test.ts, tests/discord.admin-forget.test.ts, tests/discord.admin-slash.test.ts, docs/discord.md, docs/WATCH.md, docs/DISCORD-GO-LIVE.md
- **Acceptance**: A clear 'forget me' comment (or issue body) to the watch user from an allowlisted sender on an allowlisted repo is handled by the WATCH poller with no model run and never hides another request on its issue; a declared person matched by GitHub numeric id only (IDENTITY-7) gets the same forget_requests ask as a Discord ask (requester github:<id>:<login>, origin github:<owner/repo>#<n>, no schema change; SAFE-5 memory-forget-request started/ok, fail closed; one open ask per person) and one thread reply that it went to the owner, and the bridge DMs the owner the existing Approve/Deny card naming the GitHub asker and thread; an undeclared sender is told nothing is kept and no card is raised, and a login on the list without a matching id is told it cannot be confirmed; once decided the next poll posts the outcome on the thread (no count, no content) and marks it told, and the bridge never DMs a GitHub asker; owner-only /admin people forget person:<id> (SAFE-5 admin-people-forget started/ok, denied for an undeclared id, fail closed without the trail) records the same ask (requester admin:<owner id>) and sends the same card at once, reusing an open ask; nothing is deleted before Approve; Approve deletes the person's memory, session turns and kept conversations including WATCH threads by the GitHub login and numeric id the ask came from and the declared ones (WATCH runs now keep the commenter's numeric id with the thread), never the owner who started it, and tells nobody else; memory-forget-me in a WATCH run points at the comment path; tests/watch.forget-me.test.ts and tests/discord.admin-forget.test.ts fail on main and pass on the branch (MEMORY-ACL-6.a)

## Evidence

- Verification commit: `690bd95c61429db3a58916ee12f9232d993bd82d`
- Base commit: `93ddc31a142f4da106a3c29ca78737734cfbd77b`
- Verified by: `specsync check --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #101 (MEMORY: profiles, private notes, forget on request; milestone M1
"Knows everyone"). MEMORY-ACL-6 ("Anyone can ask to be forgotten, and it
forgets once I approve on a card.") shipped with the Discord path only:
`memory-forget-me` from a Discord conversation records a `forget_requests`
ask and the bridge DMs the owner an Approve/Deny card
(`src/discord/forget-card.ts`); on GitHub the tool is refused ("ask on
Discord"), and the owner had no way to start a forget for someone else.

Leif's 2026-09-28 interview, round 12 (2026-09-29,
`/home/user/coord/interview-2026-09-28.md`): "MEMORY-ACL-6 (#101): **both** —
someone known only on GitHub can ask to be forgotten on GitHub (a WATCH comment
raises the owner's Approve/Deny card), and the owner can start a forget for any
declared person with /admin; either way it forgets only after the owner
approves." Captured in this PR's first commit, by hand under MEMORY-ACL-6 in
`hi/memory.md` (`hi` does not parse the multi-part MEMORY-ACL prefix;
`hi check` green):

- **MEMORY-ACL-6.a** "Someone known only on GitHub can ask there to be
  forgotten, and I can start it for any declared person with /admin; either
  way it forgets only after I approve on the card."

Gap on main (20a0f58): a GitHub "forget me" becomes a model run whose
`memory-forget-me` is refused ("a Discord message or command"); `/admin
people` has no forget; `forgetTargets` adds `requesterUserId` to the Discord
ids unconditionally (so a non-Discord asker would be taken for a Discord id);
kept WATCH conversations record logins only, so a person declared by GitHub
id alone is not reached.

Settled constraints: owner admins, team works; v1 off-chain (no AlgoChat /
wallet / MainNet); specs only through SpecSync; #232 / #233 untouched; no
schema bump (the asker kind and GitHub thread go in the existing
`requester_user_id` / `origin_channel_id` columns); IDENTITY-7.a (numeric id
only on GitHub, round 12) is honoured for this path; MEMORY-ACL-1..6 behaviour
for Discord asks unchanged.

## From the change's design.md

# Design

- **One ask, one card, two new doors (MEMORY-ACL-6.a).** Both paths write the
  same `forget_requests` row the Discord path writes and reuse the bridge's
  delivery pass and press handling unchanged in substance, so "forgets only
  after I approve on the card" holds by construction: nothing on either path
  deletes anything.
- **Asker kind without a schema bump.** `requester_user_id` holds a Discord
  id (as before), `github:<numeric id>:<login>` or `admin:<owner id>`; a
  GitHub ask's thread is `github:<owner/repo>#<n>` in `origin_channel_id`.
  `parseForgetRequester` / `githubOriginOf` read them (strict regexes; an
  old row is a Discord id). The Discord fallback post never sees a GitHub
  origin (GitHub asks are never notified by the bridge).
- **GitHub: no model call.** `src/watch/forget-me.ts` matches a clear
  "forget me" to the watch user deterministically (mention outside quoted
  lines; the rest reduced to a short fixed phrase set); anything else stays a
  normal run, where `memory-forget-me` now refuses by naming the comment
  path. Forget asks are taken out before the per-issue dedupe, so one never
  hides another request on the same issue, and run nothing (no ack, no
  SAFE-13 scan needed: the text is the fixed phrase). Allowlist gates
  (ALLOW-1/2) still apply first.
- **Numeric id only (IDENTITY-7 / 7.a).** The sender is resolved with the
  GitHub numeric id alone; a login-only match is answered "can't confirm"
  (no card), an undeclared sender "nothing is kept for you" (no card).
- **Telling the GitHub asker.** The poller replies once when it records the
  ask, and each cycle posts decided asks' outcomes on their thread
  (`unnotifiedGithub`, repo still allowlisted, give up after a day, stop on
  the first rate-limited or unanswered post; a locked or deleted thread does
  not hold up the others). The bridge never DMs a GitHub asker;
  the card says they will be told on GitHub. No count or content goes on a
  public thread.
- **/admin.** `/admin people forget person:<id>` follows the `/admin people`
  pattern (owner re-check, SAFE-5 `started` first, fail closed), takes a
  declared person id only (`memorySubjectForPerson`), records through a new
  `SlashContext.requestForget` and sends the card at once through
  `SlashContext.deliverForgetCards` (after the ephemeral reply, inside
  Discord's window). The owner who started it is never a forget target and
  nobody else is told.
- **Coverage of GitHub identities.** `forgetTargets` adds the asking login
  and numeric id and the declared GitHub ids; WATCH runs now store
  `github-id:<n>` in the thread's participants and `deleteForPerson` matches
  it, so a person declared by id only (or renamed) is reached.

## Design choices pending Leif

1. GitHub detection is a fixed phrase set with no model call; other wordings
   run normally and the model's `memory-forget-me` tells them the phrase.
2. GitHub asks match by numeric id only; a person declared by login only is
   told it can't be confirmed (the owner can use /admin).
3. ALLOW-1/2 still gate GitHub forget asks: a declared person who is not on
   the GitHub user allowlist is not heard on GitHub.
4. The outcome (approved / not approved / no answer, no counts) is posted on
   the public thread.
5. An undeclared GitHub sender gets a reply and no card; their words in kept
   WATCH thread conversations are not deleted on ask (30-day expiry, said in
   the reply).
6. An /admin-started forget tells nobody but the owner (the card).
7. /admin takes declared person ids only; the built-in owner entry (not
   under `[people]`) cannot be targeted.
8. The watch process posts GitHub replies and outcomes; the bridge posts the
   card; both must share the data dir (and audit key if set).

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
- `specs/watch/context.md`
- `specs/plugins/context.md`
