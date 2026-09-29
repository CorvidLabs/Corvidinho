---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: requirements
---

# Requirements

Captured HI met (captured on main with #270 from Leif's 2026-09-28 interview,
round 10; no `hi/` edits in this change):

- **DISCORD-ASK-4.a**: "When the choices can't be listed, the question still
  goes in the short public stub and the requester answers privately in a
  form; replying in the channel still works."
- Still held: DISCORD-ASK-2 (only the requester sees / uses the ask UI),
  DISCORD-ASK-3 (the answer continues that requester's session, no public
  reply needed), DISCORD-ASK-4, DISCORD-ASK-5 (~30 min, "that choice
  expired"), DISCORD-ASK-6/7/8, DISCORD-DENY-1..3, DISCORD-6, SAFE-6.

Canonical requirements changed (see deltas):

- Added **REQ-discord-548**: the free-text stub with one Answer button; the
  requester's press opens the modal; the MODAL_SUBMIT passes the press gates
  and resumes the session like a reply, scrubbed, in the stub; late
  press/submit keeps the ask for a reply; slash answers and restatements;
  gateway routing; no new settings.
- REQ-discord-044 / REQ-discord-045 are not modified: their free-text rules
  (question shown as text, reply answers, thin reply restates) still hold and
  their expiry rules are about Choose / option presses; REQ-discord-548 adds
  the Answer button on top.
