---
change: discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the
artifact: requirements
---

# Requirements

1. Bridge message path passes `humanText` = the routed human prompt (before image/memory enrichment).
2. `/session start` passes the topic; `/work` passes the description.
3. Scheduler runs pass no `humanText` (no human ⇒ no tokens).
