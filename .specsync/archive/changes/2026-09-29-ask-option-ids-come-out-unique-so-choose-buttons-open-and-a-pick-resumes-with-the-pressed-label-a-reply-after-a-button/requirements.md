---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: requirements
---

# Requirements

Captured HI met (no new criteria; nothing captured in this change):

- **DISCORD-ASK-1** (hi/discord.md): "Clarify/stuck choices that fit a short
  list use Discord components (buttons), not a public \"reply to this MCQ\"."
  → every option button of an ask has its own `custom_id`, so the Choose
  press opens the buttons even when the model repeats an option id.
- **DISCORD-ASK-3**: "Button press continues that requester's session; no
  public reply is required to answer." → a pick resumes with the label that
  was pressed, not the first option sharing its id.
- **DISCORD-ASK-5**: "Button prompts expire after about 30 minutes; a late
  press gets a short \"that choice expired\"." → an expired button ask is not
  restated by a thin reply with a Choose button that can only answer "that
  choice expired"; the reply runs the agent or restates a live ask.

Canonical requirements (see deltas): **REQ-agent-045** (Modified: option ids
unique within an ask; already-unique asks byte-identical) and
**REQ-discord-044** (Modified: a non-cancel continue clears a timed-out
button `pendingAsk` before the thin-ack rule). REQ-discord-045 ("Pick
resumes the requester session with the chosen label") is unchanged and gains
test evidence.
