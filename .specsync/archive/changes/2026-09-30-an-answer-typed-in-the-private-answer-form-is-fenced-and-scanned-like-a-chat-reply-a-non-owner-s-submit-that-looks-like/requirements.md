---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: requirements
---

# Requirements

Captured HI met (captured on main from Leif's 2026-09-28 interview, round 4
for SAFE-12/13 and round 10 for DISCORD-ASK-4.a; no `hi/` edits in this
change):

- **SAFE-12**: "Issue, PR, comment, web page and chat bodies are data to read,
  not instructions to follow; only the sender's role decides what may run."
- **SAFE-13**: "When a message looks like an injection attempt, it doesn't act
  on it, and it tells me rather than going quiet."
- **DISCORD-ASK-4.a**: "When the choices can't be listed, the question still
  goes in the short public stub and the requester answers privately in a
  form; replying in the channel still works."

Canonical requirements changed (see deltas):

- Modified **REQ-discord-548**: the accepted submit's answer reaches the model
  as a reply's would (fenced for team / community, `source=ask-answer`); a
  team / community answer the detector flags is refused like a chat reply
  (no run, ask and session kept, ephemeral refusal, one owner-only ping post
  replying to the stub, audit row); a pick's model-written label is neither
  fenced nor scanned; new acceptance bullet.
- Modified **REQ-discord-071**: the Answer form joins chat, `/session start`
  and `/work` as a scanned and fenced surface (`refuseInjectedAnswer`,
  `ask-answer`); pick labels named as not typed text; new acceptance bullet.
