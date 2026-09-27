---
change: discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume
artifact: context
---

# Context

Leif dogfood: after button pick, ephemeral "Got it — Working on it…" stayed visible
with (or allowing) further presses. pendingAsk was already cleared, but buttons
were not stripped on update and the ephemeral was never deleted after resume.
