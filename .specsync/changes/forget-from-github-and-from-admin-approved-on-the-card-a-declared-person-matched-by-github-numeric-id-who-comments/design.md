---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: design
---

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
  the first failed post for rate limits). The bridge never DMs a GitHub asker;
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
