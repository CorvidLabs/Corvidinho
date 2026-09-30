---
module: watch
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
---

# Delta — watch (a GitHub "forget me" raises the owner's card; the outcome is posted on the thread)

## Added

### REQUIREMENT REQ-watch-1016

Someone known only on GitHub can ask there to be forgotten (MEMORY-ACL-6.a,
#101). After the repo, user and actor allowlist gates, the poller SHALL take
every event `isWatchForgetMeRequest` accepts out of the run path before the
per-issue dedupe, so it starts no session, ack or model run and never hides
another request on its issue: an `issue_comment`, `issues` or
`pull_request_review_comment` event, not from the watch user, that
@mentions the watch user outside quoted (`>`) lines and, with the mention,
punctuation and case dropped, says only "forget me" / "forget about me" or
"forget / delete / erase / remove everything / all / what (you know /
remember / have / keep / store (stored / kept)) about / of / on me", with at
most a greeting, please, can / could / would / will you, I want / would like
you to, and thanks. Anything else SHALL be a normal run.

For each such event the poller SHALL mark its id processed first (a failed
write leaves it for the next cycle), then (`handleWatchForgetMe`, never
throwing) match the sender in the owner's people list re-read now by their
GitHub numeric id only (`forgetSubjectForGithubId`, IDENTITY-7; a login
alone never counts; the owner's built-in entry reads the owner's Discord-id
scope). A declared person SHALL get one `forget_requests` ask
(`recordWatchForgetMe`: requester `github:<id>:<login>`, origin
`github:<owner/repo>#<n>`; SAFE-5 `memory-forget-request` `started` first,
actor `github:<login>`, surface `watch:forget-me` — no row ⇒ nothing
recorded — then `ok`, or `error` on a store failure; one open ask per
person) and nothing SHALL be deleted; the Discord bridge DMs the owner the
card (REQ-discord-1016). Every such event SHALL get one reply on its thread
(`watchForgetMeReplyBody`, attribution footer): the request went to the
owner (or is already waiting) and nothing is forgotten unless they approve
within 24 h; for a sender not on the list, that nothing is kept for them and
no request was made (no card); for a login on the list without a matching
account id, that it cannot be confirmed (no card); no owner or a recording
failure, that nothing was recorded. A failed post SHALL feed the rate-limit
backoff.

Each poll cycle with a DB SHALL, after the rate-limit wait and before the
fetch, post the outcome of each decided GitHub ask not yet told on its thread
(`deliverWatchForgetOutcomes`, `watchForgetOutcomeBody`: approved /
not approved / no answer in time, @mentioning the asker, never a count or any
content) while its repo is still allowlisted, marking it told; an ask whose
thread cannot be reached SHALL be given up a day after its decision; the
pass SHALL stop at the first failed post (feeding the backoff) and never
throw. A run's retained conversation SHALL also keep the commenter's numeric
id as a participant (`github-id:<n>`), so a forget reaches a person declared
by GitHub id only.

Acceptance Criteria
- Through `startWatchPoller` a declared person's `@watch-user forget me` runs no model, records one pending ask (`github:4242:tofu-dev`, `github:<repo>#7`) with `memory-forget-request` `started` / `ok` as `github:tofu-dev`, posts one reply with the request id, and deletes nothing; after the owner approves on the bridge's card, the next poll posts "was approved" on that thread once (no count) and marks it told.
- An undeclared sender gets "not on the owner's people list" and no ask; a login-only declared person with another numeric id gets "can't confirm"; "don't forget me …", a quoted "forget me" and an assignment event are normal runs; a forget ask and another comment on the same issue both count; a Deny is posted as "did not approve".
- A WATCH run's kept conversation lists `github:<login>` and `github-id:<n>`.
- `tests/watch.forget-me.test.ts` covers each and fails on main.
