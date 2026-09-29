---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: research
---

# Research

- `clipKeepingRoleNote(text, max, clip)` returns `text` when it fits; else,
  when `text` ends with `\n\n(not allowed for your role)`, it clips the head
  to `max - 29` with `clip`, trims its end and re-appends the note; else it
  is exactly `clip(text, max)`. So a summary without the note is capped as
  before by construction.
- Every summary that reaches these caps comes from `collectTaskRunStream` →
  `chatBodyFromTaskResult` (at most 1800 chars, note last when present), for
  the bridge's and WATCH's spawn clients alike.
- Discord gateway `reply` / `editMessage` / `editReply` slice content at 1900
  after defanging `@everyone` / `@here`; `thinking.finalizeContent` does not
  cut. Fitting the summary after the head keeps the post within 1900 before
  the gateway sees it.
- Scheduled runs: `runChat(... actingIsAdmin: false)`; WATCH: the spawn sets
  `CORVIDINHO_ACTING_IS_ADMIN=0`. Both are where role refusals happen.
