---
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
artifact: requirements
---

# Requirements

DISCORD-3 (live status instead of a silent void) and AGENT-3 (an
interrupted run does not keep looking like it is running). Added
REQ-discord-311: a message reply is recorded while in flight and cleared on
every exit; the next bridge start marks each leftover reply interrupted by
editing the bot's own progress embed to the failed status, or replying to the
request message when that is not possible, then deletes the row. No other
REQ changes; no new slash command or env var.
