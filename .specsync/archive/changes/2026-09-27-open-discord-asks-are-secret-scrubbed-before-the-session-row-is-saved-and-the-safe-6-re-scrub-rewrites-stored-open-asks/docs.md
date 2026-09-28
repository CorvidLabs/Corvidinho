---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: docs
---

# Docs

- `docs/discord.md` (Questions and owner ping): stored pending asks have
  their question and choice labels secret-scrubbed (SAFE-6) while button ids
  stay as they are (a secret-looking choice id the model wrote becomes the
  choice's number).
- `specs/discord/discord.spec.md`: Public API note for the scrub exports
  (`scrubJsonText`, `SCRUB_TARGETS` JSON columns, `jsonUnparsed`,
  `SCRUB_RULES_VERSION` 3), the `pending_ask` paragraph, and two Behavioral
  Example scenarios.
- `specs/discord/requirements.md`: REQ-discord-066 text and acceptance.
- `specs/discord/testing.md`: coverage note for the new tests.
- `docs/DISCORD-GO-LIVE.md` already says free-text columns are scrubbed
  before they are written; this change makes that true for open asks.
