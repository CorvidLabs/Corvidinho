---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: requirements
---

# Requirements

Modifies **REQ-discord-044** (pending asks, AUTONOMY-5/6 / DISCORD-ASK /
SESSION-MULTI-3): pending asks keyed by askId; a later ask never replaces an
open button ask; a press matches its own ask; pick / late press / free-text
answer clear one ask; cancel clears all; persisted as object-or-array in the
existing column. See `deltas/discord.md`.

Source HI: SESSION-MULTI-3 (captured). Related captured ids unchanged:
DISCORD-ASK-3 (press continues the session), DISCORD-ASK-5 (late press →
"that choice expired"), DISCORD-ASK-8 (re-press after pick is a no-op),
AUTONOMY-5/6 (thin ack restates, explicit cancel).
