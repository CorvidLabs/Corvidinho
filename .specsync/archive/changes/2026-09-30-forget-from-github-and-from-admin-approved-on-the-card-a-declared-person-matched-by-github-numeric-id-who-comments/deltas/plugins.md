---
module: plugins
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
---

# Delta — plugins (memory-forget-me on GitHub names the comment path)

## Added

### REQUIREMENT REQ-plugins-1016

`memory-forget-me` in a GitHub WATCH run (no Discord actor, a GitHub
commenter set by the poller) SHALL keep refusing and record nothing, and its
refusal SHALL name the path that works there (MEMORY-ACL-6.a, #101): a comment
that @mentions the watch user and says just "forget me", which the WATCH
poller records for the owner's Approve/Deny card (REQ-watch-1016).

Acceptance Criteria
- With the GitHub commenter env set, `memory-forget-me` fails with an error naming `says just "forget me"` and MEMORY-ACL-6.a, and `forget_requests` stays empty.
- `tests/watch.forget-me.test.ts` covers it and fails on main.
