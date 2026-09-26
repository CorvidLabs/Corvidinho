---
change: discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22
artifact: requirements
---

# Requirements

- DISCORD-ASK-1..3: short-list asks use Choose stub + ephemeral option buttons;
  button press continues the requester session (no public reply required).
- DISCORD-ASK-4: free-text only when options cannot be listed.
- DISCORD-ASK-5: button TTL ~30 minutes; late press → that choice expired.
- SESSION-MULTI-1..2: sessions keyed by Discord user id + channel; independent
  concurrent users; open buttons stay valid until press/timeout.
- SESSION-MULTI-3: same user may chat while buttons are open without clearing
  pending ask (do not replace pending on new message).
- SESSION-MULTI-4: memory scoped to acting Discord user.
- Package 0.0.22; fixture tests for format/expiry/multi-user; SpecSync+fledge verify green.

