---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: requirements
---

# Requirements

- AGENT-3 (captured): "It runs a tool loop I can interrupt, and when I
  interrupt it, it actually stops instead of finishing in the background."
- AGENT-3.a / AGENT-3.b (captured): the Stop button and stop words for the
  owner and the person who asked; waiting messages still run after a stop.
  Kept unchanged for chat, pick / Answer, `/session start` and `/work`.
- AGENT-3.c (captured in this PR, Leif 2026-09-28 interview, round 13,
  2026-09-30): "I or the schedule's creator can stop a scheduled run in
  progress from Discord, the same way as a chat run." Built here.
- Interview design notes (round 13 and the slice brief, not new criteria):
  reuse the AGENT-3.a stop path; the schedule's creator plays the
  requester's role; anyone else's press gets the chat refusal; a stop ends
  that run only and the schedule's next tick runs normally; recorded on the
  run row with existing states / columns; no new slash command.
- Kept: DISCORD-SCHEDULE-3 (the channel re-checked before the progress post),
  REQ-discord-212 / 201 / 010 press gates, SAFE-20 card pass after a stop,
  REQ-discord-346 abandon at shutdown, REQ-discord-347 / AUTONOMY-6.a asks,
  DISCORD-3.b failure DMs (none for a stop), SAFE-14.a spend DMs, AUTONOMY-10 /
  10.a (the progress line is harness text), REQ-discord-741 owner stamps.
- Added: REQ-discord-304. Modified: REQ-discord-302 (the "later slice"
  sentence now points at REQ-discord-304; one acceptance bullet), REQ-discord-303
  (the schedule-run press, the DM gate exception; one acceptance bullet).
- No new env var, config key, slash command, table, column or schema version.
