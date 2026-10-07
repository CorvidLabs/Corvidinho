---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: requirements
---

# Requirements

- AUTONOMY-6.b (captured with `hi` in this change, `hi/autonomy.md`, from
  Leif's 2026-09-28 interview, round 17): "Once a session question's buttons
  expire, the session stops waiting and my next message runs normally; a
  schedule's questions still wait until answered."
- Kept: AUTONOMY-5 (a thin reply restates a live question), AUTONOMY-6 (a
  session waits on a live question until a substantive answer or a cancel),
  AUTONOMY-6.a (a schedule's question blocks it until answered or cancelled),
  DISCORD-ASK-5 (~30-minute session buttons), DISCORD-ASK-4.a (a free-text
  question stays open for a reply after its Answer button stops),
  SESSION-MULTI-3 (an earlier live ask is promoted, an expired one dropped).
- Modified: REQ-discord-044 (pending asks and the continue path) states that
  past its ~30 minutes a session's button ask no longer keeps the session
  waiting: the next message that is not a cancel runs normally, as ordinary
  chat with no prior-question block, on chat, `/work` and `/session start`
  sessions (AUTONOMY-6.b).
- Modified: REQ-discord-045 (Choose buttons and their expiry) states the two
  halves side by side: a session ask's buttons expire after ~30 minutes and
  the session stops waiting; a schedule's ask never lapses and its schedule
  still waits until it is answered or cancelled (AUTONOMY-6.b).
- No env var, config key, flag, slash command, table, schema or package
  version change.
