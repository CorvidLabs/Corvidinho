---
id: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
state: archived
type: feature
base_commit: 93ddc31a142f4da106a3c29ca78737734cfbd77b
---

# Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101)

## Intent

Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101)

## Affected Canonical Specs

- `discord`
- `watch`
- `plugins`

## Acceptance Criteria

- A clear 'forget me' comment (or issue body) to the watch user from an allowlisted sender on an allowlisted repo is handled by the WATCH poller with no model run and never hides another request on its issue; a declared person matched by GitHub numeric id only (IDENTITY-7) gets the same forget_requests ask as a Discord ask (requester github:<id>:<login>, origin github:<owner/repo>#<n>, no schema change; SAFE-5 memory-forget-request started/ok, fail closed; one open ask per person) and one thread reply that it went to the owner, and the bridge DMs the owner the existing Approve/Deny card naming the GitHub asker and thread; an undeclared sender is told nothing is kept and no card is raised, and a login on the list without a matching id is told it cannot be confirmed; once decided the next poll posts the outcome on the thread (no count, no content) and marks it told, and the bridge never DMs a GitHub asker; owner-only /admin people forget person:<id> (SAFE-5 admin-people-forget started/ok, denied for an undeclared id, fail closed without the trail) records the same ask (requester admin:<owner id>) and sends the same card at once, reusing an open ask; nothing is deleted before Approve; Approve deletes the person's memory, session turns and kept conversations including WATCH threads by the GitHub login and numeric id the ask came from and the declared ones (WATCH runs now keep the commenter's numeric id with the thread), never the owner who started it, and tells nobody else; memory-forget-me in a WATCH run points at the comment path; tests/watch.forget-me.test.ts and tests/discord.admin-forget.test.ts fail on main and pass on the branch (MEMORY-ACL-6.a)

## No-spec Rationale

Not applicable
