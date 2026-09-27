---
change: discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4
artifact: requirements
---

# Requirements

IDENTITY-4 (hi/identity.md). Added REQ-discord-446: every Discord agent run
(chat message, ask button pick resume, `/session start`, `/work`) injects
the acting user's Discord id plus the display name resolved from the owner
map and the Discord names on that interaction; the button pick resume takes
the presser's names from the component interaction. No existing REQ covered
the IDENTITY-4 inject, so this is an addition rather than a modification.
