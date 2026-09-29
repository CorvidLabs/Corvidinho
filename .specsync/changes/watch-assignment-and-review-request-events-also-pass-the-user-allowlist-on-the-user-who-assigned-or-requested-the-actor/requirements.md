---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: requirements
---

# Requirements

Captured HI met (no new criteria; no `hi/` edits):

- **ALLOW-1** (hi/allow.md): "By default Corvidinho does not reply to or act
  on GitHub messages, mentions, or review requests from people, repos, or orgs
  that are not on an allowlist I control."
- **ALLOW-2**: "... a request must match what I allowed before it may respond
  or start autonomous work."
- **ALLOW-5**: "A denied contact is refused quietly or with a short 'not
  authorized'".

Canonical requirements changed (see deltas):

- Added **REQ-watch-302**: `assignment` / `review_request` events also
  gate the user who assigned / requested (`actor`) with the same user
  allowlist gate (missing, non-allowlisted or denied actor → refused quietly:
  no session, ack or run), in the router and before the poller's dedupe;
  where the actor is read from (newest matching `assigned` /
  `review_requested` issue event), unset on a non-rate-limit failure, rate
  limits bubble; fixture maps; ids unchanged.
- REQ-watch-003 is not modified here: its text ("Every event SHALL pass repo +
  user allowlist gates before session spawn") already covers this, and the
  open change `security-gate-tests-...` modifies it; REQ-watch-302 extends
  it instead of a second concurrent edit of the same requirement.
