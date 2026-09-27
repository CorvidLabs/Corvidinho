---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: requirements
---

# Requirements

Modifies **REQ-discord-066** (SAFE-6 scrub before persist + re-scrub): open
asks in `discord_sessions.pending_ask` are among the texts scrubbed before
they are saved; scrub rules version 3 re-scrubs them value by value as JSON
with ids byte-identical; a value that is not JSON is scrubbed as text and
counted, and the log never carries stored text. See `deltas/discord.md`.

Source HI: SAFE-6 (captured, `hi/safe.md`). Out of scope: outbound / posted
option labels and a Discord-admin re-scrub command (draft SAFE-10).
