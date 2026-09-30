---
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
artifact: requirements
---

# Requirements

Confirmed HI (already captured on main from Leif's 2026-09-28 interview,
round 8; nothing new is captured in this change):

- **AUTONOMY-6.a**: "A scheduled run's question can be answered or cancelled
  by me or the schedule's creator, and the schedule's next runs wait, with
  one note, until it is." (parent **AUTONOMY-6** "Session stays blocked until
  a substantive answer or an explicit cancel.")
- Must not regress **SAFE-14.a** (#317): non-owners only ever see "Work is
  paused for budget." about a spend-cap stop.
- Uses **DISCORD-ASK-4.a** (round 10): free text through the private Answer
  form.

Canonical requirements changed (see deltas/discord.md):

- Added **REQ-discord-606**: every recorded schedule ask blocks until the
  creator or the live owner answers (Choose / Answer form) or cancels it;
  due runs skipped with no catch-up and one wait note; controls on the post
  (Cancel only for spend-cap), no lapse while open, a reply does not answer;
  a channel-less schedule asks the owner by DM; press gates; the answer to
  the next run once; schema v15 and closing legacy asks.
- Modified **REQ-discord-045**: the ~30-minute button expiry is for session
  asks; a schedule ask never lapses while open (the DISCORD-ASK-5 /
  AUTONOMY-6.a reconciliation).
- Modified **REQ-discord-347**: delivery to a channel-less schedule's owner
  DM with controls; a closed ask is never posted; the only DMs now include
  the channel-less schedule's ask and note; acceptance bullets follow the
  blocking.
- Modified **REQ-discord-353**: the could-not-start and auto-pause asks
  block (resume does not close); every in-process ask post is handed back
  when it does not go out; the columns are v15.
- Modified **REQ-discord-548**: a schedule's free-text ask carries the
  Answer button (plus Cancel) and its submit closes the schedule's ask.
