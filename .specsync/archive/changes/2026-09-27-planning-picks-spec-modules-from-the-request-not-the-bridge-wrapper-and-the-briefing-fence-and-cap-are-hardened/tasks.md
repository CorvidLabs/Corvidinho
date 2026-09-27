---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: tasks
---

# Tasks

- [x] `planningSelectionText` leaves out `[Corvidinho …]` context paragraphs and all-caps line labels; `loadRelevantSpecs` selects on it.
- [x] The fence escape covers spaced and mixed-case close tags.
- [x] The 8000-char cap never ends on half a surrogate pair.
- [x] Regression tests (fail on the PR #202 source, pass after).
- [x] REQ-agent-004 delta and agent Invariants note.
