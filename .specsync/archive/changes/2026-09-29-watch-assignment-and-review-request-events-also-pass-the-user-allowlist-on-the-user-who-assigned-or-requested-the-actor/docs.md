---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: docs
---

# Docs

- `docs/WATCH.md`: "What it does" step 2 says review requests and
  assignments gate both the author and the user who requested / assigned
  (deny wins); a new "Who assigned / requested" paragraph after "Assignee
  ingress" says where the user is read from, that a missing / non-allowlisted
  / denied user is refused quietly (no session, ack or run), and that bots
  need their login allowlisted.
- `specs/watch/testing.md`: new tests (REQ-watch-302);
  `specs/watch/watch.spec.md`: `tests/watch.request-actor.test.ts` in
  `files:`. Requirements through the delta.
- README, STATUS.md and DISCORD-GO-LIVE.md say nothing this makes false. No
  CHANGELOG / version edits.
