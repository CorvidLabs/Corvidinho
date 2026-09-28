---
change: discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume
artifact: plan
---

# Plan

1. Capture DISCORD-ASK-8 in HI; add REQ-discord-049.
2. Pick path: `components: []` on update; `deleteReply` after resume (and early fail).
3. Gateway: `deleteReply` on ComponentInteraction; pass empty components on update.
4. Fixture + CHANGELOG 0.0.25; SpecSync verify → PR → merge → restart bridge.
