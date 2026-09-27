---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: tasks
---

# Tasks

- [x] Regression tests that fail before the fix (9 bridge cases).
- [x] `formatCollapsedPing` with requester / owner pointers, dedupe and `alreadyPinged`.
- [x] `postCollapsedPing` (best effort, exact allowed mentions, reply to the collapsed answer).
- [x] Chat and button-pick collapse branches ping and track the ping post.
- [x] `finishSlashWithOwnerNotice` pings after a collapsed slash answer, no duplicate of the #160 owner notice.
- [x] Existing tests updated to expect the one ping post.
- [x] Delta REQ-discord-215 and discord spec Public API / invariants / example / error case / testing.
