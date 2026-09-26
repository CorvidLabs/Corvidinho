---
module: discord
change: discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the
---

# Delta — discord (humanText for confirm tokens)

## Added

### REQUIREMENT REQ-discord-128

Discord call sites that spawn an agent run on behalf of a human (message
path, `/session start`, `/work`) SHALL pass the human's own words as
`humanText`, separate from the memory/image-enriched prompt. SAFE-4 memory
confirm tokens SHALL be taken only from `humanText`; scheduler runs pass none.

Acceptance Criteria
- A confirm token present only in the enriched prompt (e.g. recalled memory) is not passed as human-supplied.
- Bridge, `/session start` and `/work` pass `humanText`.
